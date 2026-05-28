export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
} from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaTabViewAccess, robaLinkedWorkerActor } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import {
  departmentsInSameRobaScope,
  productDepartmentsVisibleToRobaLead,
} from '@/lib/roba-personal/deptScope'
import {
  deliveryRecordReferenceFromDocId,
  deliveryStockMovementReferenceFromDocId,
  robaRequestDocIdFromInput,
} from '@/lib/roba-personal/dotacioReferenceCodes'
import {
  lookupAppUserIdForPersonnelId,
  notifyRobaResponsibleDeliveryDispute,
  notifyRobaWorkerDeliveryAck,
} from '@/lib/roba-personal/robaRequestNotifications'
import { linesFromRequestSnapshot, type RobaDotacioLine } from '@/lib/roba-personal/requestLinesFromFirestore'

const DEL = DOTACIO_COLLECTIONS.deliveries
const MOV = DOTACIO_COLLECTIONS.stockMovements
const PROD = DOTACIO_COLLECTIONS.products
const WORK = DOTACIO_COLLECTIONS.workers
const REQ = DOTACIO_COLLECTIONS.requests
const USERS = 'users'

type Line = RobaDotacioLine
const MAX_DISPUTE_NOTE_CHARS = 2000

function parsePostedLines(raw: Array<{ productId?: string; quantity?: number; notes?: string }>): Line[] {
  return raw
    .map((l) => {
      const productId = String(l.productId || '').trim()
      const quantity = Number(l.quantity)
      const notesTrim = String(l.notes || '').trim()
      const entry: Line = { productId, quantity }
      if (notesTrim) entry.notes = notesTrim
      return entry
    })
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
}

const DELIVERY_FIELDS_STRIP_FOR_WORKER = new Set([
  'amendmentHistory',
  'workerReceiptDisputeNote',
  'workerReceiptDisputeByUserId',
  'workerReceiptDisputedAt',
])

function serializeDeliveryRow(
  id: string,
  data: Record<string, unknown>,
  forWorkerSelf: boolean
): ReturnType<typeof serializeFirestoreDoc> {
  const row = {
    ...serializeFirestoreDoc(id, data),
  } as Record<string, unknown>
  if (forWorkerSelf) {
    for (const k of DELIVERY_FIELDS_STRIP_FOR_WORKER) {
      delete row[k]
    }
  }
  return row as ReturnType<typeof serializeFirestoreDoc>
}

function aggregateQuantities(lines: Line[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
  }
  return m
}

function readProduct(data: Record<string, unknown> | undefined): {
  onHand: number
  reserved: number
} {
  const onHand = Number((data as { quantityOnHand?: number })?.quantityOnHand ?? 0)
  const reserved = Number((data as { quantityReserved?: number })?.quantityReserved ?? 0)
  return { onHand, reserved }
}

const MAX_SIGNATURE_CHARS = 350_000

async function getAllChunked(refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = []
  for (let i = 0; i < refs.length; i += 10) {
    const chunk = refs.slice(i, i + 10)
    const part = await db.getAll(...chunk)
    out.push(...part)
  }
  return out
}

/** Sol·licitant i preparador (des de la sol·licitud vinculada) per a la taula d’entregues. */
async function enrichDeliveriesWithRequestContext(
  items: ReturnType<typeof serializeFirestoreDoc>[]
): Promise<ReturnType<typeof serializeFirestoreDoc>[]> {
  const requestIds = new Set<string>()
  for (const row of items) {
    const rid = String((row as { requestId?: string }).requestId || '').trim()
    if (rid) requestIds.add(rid)
  }
  if (requestIds.size === 0) return items

  const idList = [...requestIds]
  const reqMeta = new Map<
    string,
    {
      createdByUserName: string | null
      createdByUserId: string
      preparedByUserId: string
      requestingDepartment: string | null
    }
  >()
  for (let i = 0; i < idList.length; i += 10) {
    const chunk = idList.slice(i, i + 10)
    const refs = chunk.map((id) => db.collection(REQ).doc(id))
    const snaps = await getAllChunked(refs)
    for (const s of snaps) {
      if (!s.exists) continue
      const d = s.data() as Record<string, unknown>
      const puid = String(d.preparedByUserId || '').trim()
      const cuid = String(d.createdByUserId || '').trim()
      const dept = String(d.requestingDepartment || '').trim()
      reqMeta.set(s.id, {
        createdByUserName: (() => {
          const n = String(d.createdByUserName || '').trim()
          return n || null
        })(),
        createdByUserId: cuid,
        preparedByUserId: puid,
        requestingDepartment: dept || null,
      })
    }
  }

  const userIdsToResolve = new Set<string>()
  for (const v of reqMeta.values()) {
    if (v.preparedByUserId) userIdsToResolve.add(v.preparedByUserId)
    if (v.createdByUserId) userIdsToResolve.add(v.createdByUserId)
  }
  const userNameById = new Map<string, string>()
  const userEmailById = new Map<string, string>()
  const uidList = [...userIdsToResolve]
  for (let i = 0; i < uidList.length; i += 10) {
    const chunk = uidList.slice(i, i + 10)
    const refs = chunk.map((id) => db.collection(USERS).doc(id))
    const snaps = await getAllChunked(refs)
    for (const s of snaps) {
      if (!s.exists) continue
      const n = String((s.data() as { name?: string }).name || '').trim()
      const e = String((s.data() as { email?: string }).email || '').trim()
      if (n) userNameById.set(s.id, n)
      if (e) userEmailById.set(s.id, e)
    }
  }

  return items.map((row) => {
    const rid = String((row as { requestId?: string }).requestId || '').trim()
    if (!rid) return row
    const meta = reqMeta.get(rid)
    if (!meta) return row
    const requestCreatedByUserName =
      meta.createdByUserName ||
      (meta.createdByUserId ? userNameById.get(meta.createdByUserId) ?? null : null)
    const requestPreparedByName = meta.preparedByUserId
      ? userNameById.get(meta.preparedByUserId) ?? null
      : null
    const requestCreatedByUserEmail = meta.createdByUserId
      ? userEmailById.get(meta.createdByUserId) ?? null
      : null
    return {
      ...row,
      requestCreatedByUserName,
      requestPreparedByName,
      requestCreatedByUserEmail,
      requestRequestingDepartment: meta.requestingDepartment,
    } as typeof row
  })
}

async function filterDeliveriesForDeptLead(
  rows: ReturnType<typeof serializeFirestoreDoc>[],
  leadDeptNorm: string
) {
  const workerIds = new Set<string>()
  const requestIds = new Set<string>()
  for (const row of rows) {
    workerIds.add(String((row as { workerId?: string }).workerId || '').trim())
    const rid = String((row as { requestId?: string }).requestId || '').trim()
    if (rid) requestIds.add(rid)
  }
  const wRefs = [...workerIds].filter(Boolean).map((id) => db.collection(WORK).doc(id))
  const rRefs = [...requestIds].filter(Boolean).map((id) => db.collection(REQ).doc(id))
  const wSnaps = wRefs.length ? await getAllChunked(wRefs) : []
  const rSnaps = rRefs.length ? await getAllChunked(rRefs) : []
  const workerDept = new Map<string, string>()
  for (const s of wSnaps) {
    if (s.exists) {
      workerDept.set(s.id, String((s.data() as { department?: string }).department || ''))
    }
  }
  const reqDept = new Map<string, string>()
  for (const s of rSnaps) {
    if (s.exists) {
      reqDept.set(
        s.id,
        String((s.data() as { requestingDepartment?: string }).requestingDepartment || '')
      )
    }
  }
  return rows.filter((row) => {
    const w = String((row as { workerId?: string }).workerId || '').trim()
    const wdep = workerDept.get(w) || ''
    if (departmentsInSameRobaScope(wdep, leadDeptNorm)) return true
    const rid = String((row as { requestId?: string }).requestId || '').trim()
    if (rid) {
      const rd = reqDept.get(rid) || ''
      if (departmentsInSameRobaScope(rd, leadDeptNorm)) return true
    }
    return false
  })
}

export async function GET() {
  const auth = await requireRobaTabViewAccess(ROBA_SUBMODULE_PATHS.entregues)
  if (!auth.ok) return auth.res

  let items: ReturnType<typeof serializeFirestoreDoc>[]

  if (auth.access.scope === 'workerSelf') {
    const pid = auth.access.linkedPersonnelId
    const snap = await db
      .collection(DEL)
      .where('workerId', '==', pid)
      .orderBy('deliveredAt', 'desc')
      .limit(200)
      .get()
    items = snap.docs.map((d) =>
      serializeDeliveryRow(d.id, d.data() as Record<string, unknown>, true)
    )
  } else {
    const snap = await db.collection(DEL).orderBy('deliveredAt', 'desc').limit(200).get()
    items = snap.docs.map((d) =>
      serializeDeliveryRow(d.id, d.data() as Record<string, unknown>, false)
    )
    if (auth.access.scope === 'deptLead') {
      items = await filterDeliveriesForDeptLead(items, auth.access.leadDeptNorm)
    }
  }
  items.sort((a, b) =>
    String(b.deliveredAt || b.createdAt || '').localeCompare(
      String(a.deliveredAt || a.createdAt || '')
    )
  )
  items = await enrichDeliveriesWithRequestContext(items)
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaTabViewAccess(ROBA_SUBMODULE_PATHS.entregues)
  if (!auth.ok) return auth.res
  const access = auth.access

  const body = (await req.json()) as {
    action?: string
    workerId?: string
    lines?: Array<{ productId?: string; quantity?: number; notes?: string }>
    proposedLines?: Array<{ productId?: string; quantity?: number; notes?: string }>
    note?: string
    notes?: string
    acknowledgmentRef?: string
    requestId?: string
    deliveryWithoutRequest?: boolean
    acknowledgmentSignatureDataUrl?: string
  }
  const action = String(body.action || '').trim()
  const requestId = robaRequestDocIdFromInput(String(body.requestId || ''))
  const sig = String(body.acknowledgmentSignatureDataUrl || '').trim()

  const linkedActor = robaLinkedWorkerActor(access)
  const isLinkedWorkerDeliveryPost =
    Boolean(linkedActor) &&
    (action === 'reportWorkerReceiptDispute' || (Boolean(requestId) && Boolean(sig)))

  let workerId = String(body.workerId || '').trim()
  const isWorkerSelfDispute = action === 'reportWorkerReceiptDispute' && isLinkedWorkerDeliveryPost
  const disputeNote = isWorkerSelfDispute
    ? String(body.note || '').trim().slice(0, MAX_DISPUTE_NOTE_CHARS)
    : ''
  const disputeProposedLines = isWorkerSelfDispute
    ? parsePostedLines(Array.isArray(body.proposedLines) ? body.proposedLines : [])
    : []

  if (access.scope === 'workerSelf') {
    if (!linkedActor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    workerId = linkedActor.linkedPersonnelId
    if (String(body.workerId || '').trim() && String(body.workerId || '').trim() !== workerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (access.scope === 'deptLead' && isLinkedWorkerDeliveryPost) {
    workerId = linkedActor!.linkedPersonnelId
    if (String(body.workerId || '').trim() && String(body.workerId || '').trim() !== workerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  if (!workerId) {
    return NextResponse.json({ error: 'Cal workerId.' }, { status: 400 })
  }

  const deliveryWithoutRequest = Boolean(body.deliveryWithoutRequest)
  if (access.scope === 'workerSelf' && deliveryWithoutRequest) {
    return NextResponse.json(
      { error: 'Les entregues sense sol·licitud només les poden registrar RRHH o caps de roba.' },
      { status: 403 }
    )
  }
  if (!requestId && !deliveryWithoutRequest) {
    return NextResponse.json(
      { error: 'Cal indicar requestId o marcar deliveryWithoutRequest.' },
      { status: 400 }
    )
  }
  if (requestId && deliveryWithoutRequest) {
    return NextResponse.json(
      { error: 'No es pot combinar requestId amb deliveryWithoutRequest.' },
      { status: 400 }
    )
  }

  const wsnap = await db.collection(WORK).doc(workerId).get()
  if (!wsnap.exists) {
    return NextResponse.json({ error: 'Treballador no trobat.' }, { status: 400 })
  }
  const workerDept = String(
    (wsnap.data() as { department?: string })?.department || ''
  ).trim()

  if (sig.length > MAX_SIGNATURE_CHARS) {
    return NextResponse.json({ error: 'Signatura massa gran.' }, { status: 400 })
  }

  let lines: Line[]

  const applyingWorkerLinkedDeliveryRules =
    access.scope === 'workerSelf' || (access.scope === 'deptLead' && isLinkedWorkerDeliveryPost)

  if (applyingWorkerLinkedDeliveryRules) {
    if (!linkedActor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!isWorkerSelfDispute && !sig) {
      return NextResponse.json(
        { error: 'Cal signar per confirmar la recepció del material.' },
        { status: 400 }
      )
    }
    if (!requestId) {
      return NextResponse.json(
        { error: 'Cal indicar la sol·licitud que voleu confirmar.' },
        { status: 400 }
      )
    }
    if (!departmentsInSameRobaScope(workerDept, linkedActor.workerDeptNorm)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const rsnap = await db.collection(REQ).doc(requestId).get()
    if (!rsnap.exists) {
      return NextResponse.json({ error: 'Sol·licitud no trobada.' }, { status: 404 })
    }
    const rdata = rsnap.data() as Record<string, unknown>
    const st = String(rdata.status || '').trim()
    if (st !== 'ready_for_worker_delivery' && st !== 'picked_up') {
      return NextResponse.json(
        {
          error:
            'Només podeu confirmar material en estat «recollit», després que el responsable de roba ho hagi validat.',
        },
        { status: 400 }
      )
    }
    const rw = String((rdata as { requestedByWorkerId?: string }).requestedByWorkerId || '').trim()
    if (rw && rw !== linkedActor.linkedPersonnelId) {
      return NextResponse.json({ error: 'Aquesta sol·licitud no és vostra.' }, { status: 403 })
    }
    const rd = String((rdata as { requestingDepartment?: string }).requestingDepartment || '')
    if (!departmentsInSameRobaScope(rd, linkedActor.workerDeptNorm)) {
      return NextResponse.json({ error: 'Sol·licitud d’un altre departament.' }, { status: 403 })
    }

    lines = linesFromRequestSnapshot(rdata)
    if (lines.length === 0) {
      return NextResponse.json({ error: 'La sol·licitud no té línies vàlides.' }, { status: 400 })
    }

    for (const line of lines) {
      const psnap = await db.collection(PROD).doc(line.productId).get()
      if (!psnap.exists) {
        return NextResponse.json({ error: `Producte no trobat: ${line.productId}` }, { status: 400 })
      }
      const pdata = psnap.data() as { departments?: string[] }
      if (!productDepartmentsVisibleToRobaLead(pdata.departments, linkedActor.workerDeptNorm)) {
        return NextResponse.json(
          { error: `Producte no permès per al vostre departament: ${line.productId}` },
          { status: 403 }
        )
      }
    }
    for (const line of disputeProposedLines) {
      const psnap = await db.collection(PROD).doc(line.productId).get()
      if (!psnap.exists) {
        return NextResponse.json({ error: `Producte no trobat: ${line.productId}` }, { status: 400 })
      }
      const pdata = psnap.data() as { departments?: string[] }
      if (!productDepartmentsVisibleToRobaLead(pdata.departments, linkedActor.workerDeptNorm)) {
        return NextResponse.json(
          { error: `Producte no permÃ¨s per al vostre departament: ${line.productId}` },
          { status: 403 }
        )
      }
    }
  } else {
    const linesIn = Array.isArray(body.lines) ? body.lines : []
    lines = parsePostedLines(linesIn)

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Cal almenys una línia vàlida.' }, { status: 400 })
    }

    if (access.scope === 'deptLead') {
      if (!departmentsInSameRobaScope(workerDept, access.leadDeptNorm)) {
        return NextResponse.json(
          { error: 'Treballador fora del vostre departament.' },
          { status: 403 }
        )
      }
      for (const line of lines) {
        const psnap = await db.collection(PROD).doc(line.productId).get()
        if (!psnap.exists) {
          return NextResponse.json({ error: `Producte no trobat: ${line.productId}` }, { status: 400 })
        }
        const pdata = psnap.data() as { departments?: string[] }
        if (!productDepartmentsVisibleToRobaLead(pdata.departments, access.leadDeptNorm)) {
          return NextResponse.json(
            { error: `Producte no permès per al vostre departament: ${line.productId}` },
            { status: 403 }
          )
        }
      }
      if (requestId) {
        const rsnap = await db.collection(REQ).doc(requestId).get()
        if (!rsnap.exists) {
          return NextResponse.json({ error: 'Sol·licitud no trobada.' }, { status: 404 })
        }
        const rd = String(
          (rsnap.data() as { requestingDepartment?: string })?.requestingDepartment || ''
        )
        if (!departmentsInSameRobaScope(rd, access.leadDeptNorm)) {
          return NextResponse.json(
            { error: 'Sol·licitud d’un altre departament.' },
            { status: 403 }
          )
        }
      }
    }
  }

  let notifyWorkerUid: string | null = null
  let requestingDeptForNotify = ''
  if (access.scope === 'full' || access.scope === 'deptLead') {
    notifyWorkerUid = await lookupAppUserIdForPersonnelId(workerId)
    if (notifyWorkerUid === access.userId) notifyWorkerUid = null
    if (requestId) {
      const rsPre = await db.collection(REQ).doc(requestId).get()
      if (rsPre.exists) {
        requestingDeptForNotify = String(
          (rsPre.data() as { requestingDepartment?: string })?.requestingDepartment || ''
        )
      }
    }
  }

  const deliveryRef = db.collection(DEL).doc()
  const now = FieldValue.serverTimestamp()
  const qtyByProduct = aggregateQuantities(lines)

  try {
    await db.runTransaction(async (tx) => {
      let reqRef: DocumentReference | null = null
      let reqData: Record<string, unknown> | null = null

      if (requestId) {
        reqRef = db.collection(REQ).doc(requestId)
        const rsnap = await tx.get(reqRef)
        if (!rsnap.exists) throw new Error('Sol·licitud no trobada.')
        reqData = rsnap.data() as Record<string, unknown>
        const st = String(reqData.status || '')
        if (st !== 'ready_for_worker_delivery' && st !== 'picked_up') {
          throw new Error('La sol·licitud ha d’estar en estat «recollit» abans de l’entrega.')
        }
        const rw = String(reqData.requestedByWorkerId || '').trim()
        if (rw && rw !== workerId) {
          throw new Error('El treballador ha de ser el de la sol·licitud.')
        }
      }

      const hadStockReservation = false
      const movementMeta = new Map<string, { nextReserved: number; reservedDelta: number }>()
      for (const [productId, qty] of qtyByProduct) {
        const pref = db.collection(PROD).doc(productId)
        const psnap = await tx.get(pref)
        if (!psnap.exists) throw new Error(`Producte no trobat: ${productId}`)
        const { onHand, reserved } = readProduct(psnap.data() as Record<string, unknown>)
        if (onHand < qty) throw new Error('Estoc insuficient per completar l’entrega.')
        const nextReserved =
          requestId && hadStockReservation ? Math.max(0, reserved - qty) : reserved
        if (requestId && hadStockReservation && reserved < qty) {
          throw new Error(`Reserva insuficient per al producte ${productId}.`)
        }
        movementMeta.set(productId, {
          nextReserved,
          reservedDelta: hadStockReservation ? -qty : 0,
        })
        tx.update(pref, {
          quantityOnHand: onHand - qty,
          quantityReserved: nextReserved,
          updatedAt: now,
        })
        if (requestId) {
          tx.update(pref, {
            quantityOnHand: onHand,
            quantityReserved: reserved,
            updatedAt: now,
          })
        }
      }

      const isWorkerSelfSignedDelivery =
        applyingWorkerLinkedDeliveryRules && !isWorkerSelfDispute && Boolean(sig)
      const deliveryPayload: Record<string, unknown> = {
        workerId,
        lines,
        /** Snapshot del que constava a la sol·licitud en registrar l’entrega (pot diferir de `lines`). */
        requestedLines: requestId && reqData ? linesFromRequestSnapshot(reqData) : null,
        deliveredAt: now,
        reference: deliveryRecordReferenceFromDocId(deliveryRef.id),
        acknowledgmentRef: String(body.acknowledgmentRef || '').trim() || null,
        acknowledgmentSignatureDataUrl: sig || null,
        acknowledgedAt: now,
        acknowledgedByUserId: access.userId,
        notes: String(body.notes || '').trim() || null,
        requestId: requestId || null,
        deliveryWithoutRequest: deliveryWithoutRequest || false,
        createdByUserId: access.userId,
        createdAt: now,
        /** Si el treballador té usuari d’app, ha de confirmar recepció després del registre del responsable. */
        workerReceiptAckExpected: isWorkerSelfDispute ? true : Boolean(notifyWorkerUid),
        /** Signatura del propi treballador: una sola passada (sense pas de confirmació pendent). */
        workerReceiptAckAt: isWorkerSelfSignedDelivery ? now : null,
        workerReceiptAckByUserId: isWorkerSelfSignedDelivery ? access.userId : null,
        workerReceiptAckSignatureDataUrl: isWorkerSelfSignedDelivery ? sig : null,
        workerReceiptDisputedAt: isWorkerSelfDispute ? now : null,
        workerReceiptDisputeNote: isWorkerSelfDispute ? disputeNote || null : null,
        workerReceiptDisputeByUserId: isWorkerSelfDispute ? access.userId : null,
        workerReceiptDisputeProposedLines:
          isWorkerSelfDispute && disputeProposedLines.length > 0 ? disputeProposedLines : null,
        workerReceiptCorrectionOpen: isWorkerSelfDispute,
        amendmentHistory: isWorkerSelfDispute
          ? [
              {
                action: 'worker_dispute',
                at: Date.now(),
                byUserId: access.userId,
                note: disputeNote || null,
                proposedLines: disputeProposedLines.length > 0 ? disputeProposedLines : null,
              },
            ]
          : [],
      }

      tx.set(deliveryRef, deliveryPayload)

      const requestingDeptMeta =
        requestId && reqData
          ? String((reqData as { requestingDepartment?: string }).requestingDepartment || '').trim()
          : ''

      for (const [productId, qty] of qtyByProduct) {
        const meta = movementMeta.get(productId)
        if (!meta) throw new Error(`Moviment sense metadades: ${productId}`)
        const mref = db.collection(MOV).doc()
        tx.set(mref, {
          productId,
          quantityDelta: requestId ? 0 : -qty,
          reason: 'delivery',
          reference: deliveryStockMovementReferenceFromDocId(mref.id),
          notes: `Entrega ${deliveryRecordReferenceFromDocId(deliveryRef.id)} · treballador ${workerId}`,
          deliveryId: deliveryRef.id,
          createdByUserId: access.userId,
          createdAt: now,
          quantityReservedDelta: meta.reservedDelta,
          productReservedAfter: meta.nextReserved,
          requestingDepartment: requestingDeptMeta || null,
          workerDepartment: workerDept || null,
        })
      }

      if (reqRef && reqData) {
        const needsWorkerAppAck = isWorkerSelfDispute || Boolean(notifyWorkerUid)
        const reqUpdate: Record<string, unknown> = {
          fulfilledAt: now,
          fulfillmentDeliveryId: deliveryRef.id,
          updatedAt: now,
        }
        if (needsWorkerAppAck) {
          reqUpdate.status = 'fulfilled'
        } else {
          reqUpdate.status = 'receipt_confirmed'
          reqUpdate.receiptConfirmedAt = now
        }
        tx.update(reqRef, reqUpdate)
      }
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const doc = await deliveryRef.get()
  const ddata = doc.data() as Record<string, unknown>
  const out = serializeFirestoreDoc(doc.id, ddata)

  if (notifyWorkerUid && !isWorkerSelfDispute) {
    const dref = String((ddata.reference as string) || deliveryRecordReferenceFromDocId(doc.id))
    try {
      await notifyRobaWorkerDeliveryAck({
        targetUserId: notifyWorkerUid,
        deliveryId: doc.id,
        requestId: requestId || '',
        deliveryReference: dref,
        requestingDepartment: requestingDeptForNotify,
      })
    } catch (e) {
      console.error('[roba-personal/deliveries POST] notify worker ack', e)
    }
  }

  if (isWorkerSelfDispute && requestId) {
    try {
      const rs = await db.collection(REQ).doc(requestId).get()
      const requestData = rs.exists ? (rs.data() as Record<string, unknown>) : {}
      const responsibleUid = String(
        requestData.validatedByLeadUserId ||
          requestData.preparedByUserId ||
          requestData.createdByUserId ||
          ''
      ).trim()
      const workerName = String((wsnap.data() as { name?: string }).name || '').trim()
      if (responsibleUid) {
        await notifyRobaResponsibleDeliveryDispute({
          targetUserId: responsibleUid,
          deliveryId: doc.id,
          deliveryReference: String(
            (ddata.reference as string) || deliveryRecordReferenceFromDocId(doc.id)
          ),
          workerName: workerName || undefined,
          note: disputeNote || undefined,
          proposedLinesSummary:
            disputeProposedLines.length > 0
              ? disputeProposedLines.map((l) => `${l.productId}×${l.quantity}`).join(', ')
              : undefined,
        })
      }
    } catch (e) {
      console.error('[roba-personal/deliveries POST] notify dispute', e)
    }
  }

  return NextResponse.json(out, { status: 201 })
}

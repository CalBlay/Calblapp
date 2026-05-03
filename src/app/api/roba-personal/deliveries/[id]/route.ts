export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { resolveRobaAccess, type RobaAccessWorkerSelf } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import {
  deliveryStockMovementReferenceFromDocId,
  robaRequestDocIdFromInput,
} from '@/lib/roba-personal/dotacioReferenceCodes'
import { linesFromRequestSnapshot, type RobaDotacioLine } from '@/lib/roba-personal/requestLinesFromFirestore'
import {
  lookupAppUserIdForPersonnelId,
  notifyRobaResponsibleDeliveryDispute,
  notifyRobaWorkerDeliveryRevised,
} from '@/lib/roba-personal/robaRequestNotifications'
const DEL = DOTACIO_COLLECTIONS.deliveries
const REQ = DOTACIO_COLLECTIONS.requests
const WORK = DOTACIO_COLLECTIONS.workers
const PROD = DOTACIO_COLLECTIONS.products
const MOV = DOTACIO_COLLECTIONS.stockMovements

const MAX_WORKER_ACK_SIGNATURE_CHARS = 350_000
const MAX_DISPUTE_NOTE_CHARS = 2000
const MAX_AMENDMENT_ENTRIES = 40

function aggregateQuantities(lines: RobaDotacioLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.quantity)
  }
  return m
}

function parsePatchLines(raw: unknown[]): RobaDotacioLine[] {
  return raw
    .map((l) => {
      const productId = String((l as { productId?: string }).productId || '').trim()
      const quantity = Number((l as { quantity?: number }).quantity)
      const notesTrim = String((l as { notes?: string }).notes || '').trim()
      const entry: RobaDotacioLine = { productId, quantity }
      if (notesTrim) entry.notes = notesTrim
      return entry
    })
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
}

function linesFromStoredDelivery(cur: Record<string, unknown>): RobaDotacioLine[] {
  return linesFromRequestSnapshot({ lines: cur.lines } as Record<string, unknown>)
}

function trimAmendmentHistory(h: unknown[]): unknown[] {
  if (h.length <= MAX_AMENDMENT_ENTRIES) return h
  return h.slice(h.length - MAX_AMENDMENT_ENTRIES)
}

/**
 * Treballador: confirma que ha rebut el material d’una entrega registrada pel responsable de roba.
 */
async function patchConfirmWorkerReceipt(
  access: RobaAccessWorkerSelf,
  deliveryId: string,
  body: { workerReceiptAckSignatureDataUrl?: string }
) {
  const sig = String(body.workerReceiptAckSignatureDataUrl || '').trim()
  if (!sig) {
    return NextResponse.json(
      { error: 'Cal signar per confirmar la recepció del material.' },
      { status: 400 }
    )
  }
  if (sig.length > MAX_WORKER_ACK_SIGNATURE_CHARS) {
    return NextResponse.json({ error: 'Signatura massa gran.' }, { status: 400 })
  }

  const dref = db.collection(DEL).doc(deliveryId)
  const dsnap = await dref.get()
  if (!dsnap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const cur = dsnap.data() as Record<string, unknown>
  const dw = String(cur.workerId || '').trim()
  if (dw !== access.linkedPersonnelId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (cur.workerReceiptAckExpected !== true) {
    return NextResponse.json(
      { error: 'Aquesta entrega no requereix confirmació addicional.' },
      { status: 400 }
    )
  }
  if (cur.workerReceiptCorrectionOpen === true) {
    return NextResponse.json(
      {
        error:
          'Hi ha una incidència pendent de correcció per part del responsable. Espereu o contacteu roba.',
      },
      { status: 400 }
    )
  }
  if (cur.workerReceiptAckAt != null) {
    return NextResponse.json({ error: 'Ja heu confirmat aquesta recepció.' }, { status: 400 })
  }

  const requestId = String(cur.requestId || '').trim()

  await dref.update({
    workerReceiptAckAt: FieldValue.serverTimestamp(),
    workerReceiptAckByUserId: access.userId,
    workerReceiptAckSignatureDataUrl: sig,
    updatedAt: FieldValue.serverTimestamp(),
  })

  if (requestId) {
    const rref = db.collection(REQ).doc(requestId)
    const rsnap = await rref.get()
    if (rsnap.exists) {
      const rd = rsnap.data() as Record<string, unknown>
      const st = String(rd.status || '').trim()
      const fd = String((rd as { fulfillmentDeliveryId?: string }).fulfillmentDeliveryId || '').trim()
      if (st === 'fulfilled' && fd === deliveryId) {
        await rref.update({
          status: 'receipt_confirmed',
          receiptConfirmedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
    }
  }

  const next = await dref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

/** Treballador: el material no coincideix amb el registrat pel responsable. */
async function patchReportWorkerReceiptDispute(
  access: RobaAccessWorkerSelf,
  deliveryId: string,
  body: { note?: string }
) {
  const note = String(body.note || '').trim().slice(0, MAX_DISPUTE_NOTE_CHARS)

  const dref = db.collection(DEL).doc(deliveryId)
  const dsnap = await dref.get()
  if (!dsnap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const cur = dsnap.data() as Record<string, unknown>
  const dw = String(cur.workerId || '').trim()
  if (dw !== access.linkedPersonnelId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (cur.workerReceiptAckExpected !== true) {
    return NextResponse.json({ error: 'Aquesta entrega no admet aquesta acció.' }, { status: 400 })
  }
  if (cur.workerReceiptAckAt != null) {
    return NextResponse.json(
      { error: 'Ja heu confirmat la recepció. Si hi ha un problema, contacteu roba.' },
      { status: 400 }
    )
  }
  if (cur.workerReceiptCorrectionOpen === true) {
    return NextResponse.json(
      { error: 'Ja hi ha una incidència oberta per a aquesta entrega.' },
      { status: 400 }
    )
  }

  const now = FieldValue.serverTimestamp()
  const prevHistory = Array.isArray(cur.amendmentHistory) ? [...cur.amendmentHistory] : []
  prevHistory.push({
    action: 'worker_dispute',
    at: Date.now(),
    byUserId: access.userId,
    note: note || null,
  })

  await dref.update({
    workerReceiptDisputedAt: now,
    workerReceiptDisputeNote: note || null,
    workerReceiptDisputeByUserId: access.userId,
    workerReceiptCorrectionOpen: true,
    amendmentHistory: trimAmendmentHistory(prevHistory),
    updatedAt: now,
  })

  const responsibleUid = String(
    (cur.acknowledgedByUserId || cur.createdByUserId || '') as string
  ).trim()
  const refStr = String((cur.reference as string) || '').trim() || `E-${deliveryId}`

  let workerName = ''
  if (dw) {
    const ws = await db.collection(WORK).doc(dw).get()
    if (ws.exists) {
      workerName = String((ws.data() as { name?: string }).name || '').trim()
    }
  }

  if (responsibleUid) {
    try {
      await notifyRobaResponsibleDeliveryDispute({
        targetUserId: responsibleUid,
        deliveryId,
        deliveryReference: refStr,
        workerName: workerName || undefined,
        note: note || undefined,
      })
    } catch (e) {
      console.error('[deliveries PATCH] notify dispute', e)
    }
  }

  const next = await dref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

/** Responsable: corregeix les línies d’entrega (estoc + auditoria); el treballador ha de tornar a confirmar. */
async function patchCorrectDeliveryLines(
  access: { scope: 'full' | 'deptLead'; userId: string; leadDeptNorm?: string },
  deliveryId: string,
  body: { lines?: unknown[]; note?: string }
) {
  const linesIn = Array.isArray(body.lines) ? body.lines : []
  const newLines = parsePatchLines(linesIn)
  if (newLines.length === 0) {
    return NextResponse.json({ error: 'Cal almenys una línia vàlida.' }, { status: 400 })
  }

  const corrNote = String(body.note || '').trim().slice(0, MAX_DISPUTE_NOTE_CHARS)

  const dref = db.collection(DEL).doc(deliveryId)
  const dsnap = await dref.get()
  if (!dsnap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const curPre = dsnap.data() as Record<string, unknown>
  if (curPre.workerReceiptCorrectionOpen !== true) {
    return NextResponse.json(
      { error: 'Aquesta entrega no està pendent de correcció.' },
      { status: 400 }
    )
  }

  if (access.scope === 'deptLead') {
    const dw = String(curPre.workerId || '').trim()
    if (dw) {
      const ws = await db.collection(WORK).doc(dw).get()
      const wdep = ws.exists
        ? String((ws.data() as { department?: string }).department || '').trim()
        : ''
      if (!departmentsInSameRobaScope(wdep, access.leadDeptNorm || '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    const rid = String(curPre.requestId || '').trim()
    if (rid) {
      const rs = await db.collection(REQ).doc(rid).get()
      const rd = rs.exists
        ? String((rs.data() as { requestingDepartment?: string }).requestingDepartment || '')
        : ''
      if (!departmentsInSameRobaScope(rd, access.leadDeptNorm || '')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  const now = FieldValue.serverTimestamp()
  const workerId = String(curPre.workerId || '').trim()
  const deliveryRefStr = String((curPre.reference as string) || '').trim() || `E-${deliveryId}`

  try {
    await db.runTransaction(async (tx) => {
      const ds = await tx.get(dref)
      if (!ds.exists) throw new Error('No trobat')
      const cur = ds.data() as Record<string, unknown>
      if (cur.workerReceiptCorrectionOpen !== true) {
        throw new Error('Aquesta entrega no està pendent de correcció.')
      }

      const oldLines = linesFromStoredDelivery(cur)
      const oldAgg = aggregateQuantities(oldLines)
      const newAgg = aggregateQuantities(newLines)
      const allPids = [...new Set([...oldAgg.keys(), ...newAgg.keys()])]

      const prefByPid = new Map<string, DocumentReference>()
      for (const productId of allPids) {
        prefByPid.set(productId, db.collection(PROD).doc(productId))
      }
      const prodSnaps = await Promise.all(
        allPids.map((pid) => tx.get(prefByPid.get(pid)!))
      )
      const onHandByPid = new Map<string, number>()
      for (let i = 0; i < allPids.length; i++) {
        const pid = allPids[i]
        const psnap = prodSnaps[i]
        if (!psnap.exists) throw new Error(`Producte no trobat: ${pid}`)
        onHandByPid.set(
          pid,
          Number((psnap.data() as { quantityOnHand?: number })?.quantityOnHand ?? 0)
        )
      }

      for (const productId of allPids) {
        const oldQ = oldAgg.get(productId) ?? 0
        const newQ = newAgg.get(productId) ?? 0
        const diff = newQ - oldQ
        if (diff === 0) continue
        const onHand = onHandByPid.get(productId) ?? 0
        if (diff > 0 && onHand < diff) {
          throw new Error('Estoc insuficient per aplicar la correcció.')
        }
      }

      const prevHistory = Array.isArray(cur.amendmentHistory) ? [...cur.amendmentHistory] : []
      prevHistory.push({
        action: 'lines_correction',
        at: Date.now(),
        byUserId: access.userId,
        note: corrNote || null,
        previousLines: oldLines,
        newLines,
      })

      tx.update(dref, {
        lines: newLines,
        workerReceiptDisputedAt: null,
        workerReceiptDisputeNote: null,
        workerReceiptDisputeByUserId: null,
        workerReceiptCorrectionOpen: false,
        workerReceiptAckAt: null,
        workerReceiptAckByUserId: null,
        workerReceiptAckSignatureDataUrl: null,
        amendmentHistory: trimAmendmentHistory(prevHistory),
        updatedAt: now,
      })

      for (const productId of allPids) {
        const oldQ = oldAgg.get(productId) ?? 0
        const newQ = newAgg.get(productId) ?? 0
        const diff = newQ - oldQ
        if (diff === 0) continue
        const pref = prefByPid.get(productId)!
        const onHand = onHandByPid.get(productId) ?? 0
        tx.update(pref, {
          quantityOnHand: onHand - diff,
          updatedAt: now,
        })
        const mref = db.collection(MOV).doc()
        tx.set(mref, {
          productId,
          quantityDelta: -diff,
          reason: 'delivery_correction',
          reference: deliveryStockMovementReferenceFromDocId(mref.id),
          notes: `Correcció ${deliveryRefStr} · Δ ${diff > 0 ? '+' : ''}${diff}`,
          deliveryId,
          createdByUserId: access.userId,
          createdAt: now,
        })
      }
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const doc = await dref.get()
  const ddata = doc.data() as Record<string, unknown>
  const requestId = String(ddata.requestId || '').trim()
  let requestingDepartment = ''
  if (requestId) {
    const rs = await db.collection(REQ).doc(requestId).get()
    if (rs.exists) {
      requestingDepartment = String(
        (rs.data() as { requestingDepartment?: string }).requestingDepartment || ''
      )
    }
  }

  const notifyUid = await lookupAppUserIdForPersonnelId(workerId)
  if (notifyUid && ddata.workerReceiptAckExpected === true) {
    try {
      await notifyRobaWorkerDeliveryRevised({
        targetUserId: notifyUid,
        deliveryId,
        requestId,
        deliveryReference: deliveryRefStr,
        requestingDepartment,
      })
    } catch (e) {
      console.error('[deliveries PATCH] notify revised', e)
    }
  }

  return NextResponse.json(serializeFirestoreDoc(doc.id, ddata))
}

/**
 * Vincula una entrega «sense sol·licitud» a una sol·licitud existent (desapareix l’avís).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res
  const access = auth.access

  const { id } = await ctx.params

  let body: {
    action?: string
    requestId?: string
    workerReceiptAckSignatureDataUrl?: string
    note?: string
    lines?: unknown[]
  } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }

  if (body.action === 'confirmWorkerReceipt') {
    if (access.scope !== 'workerSelf') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return patchConfirmWorkerReceipt(access, id, body)
  }

  if (body.action === 'reportWorkerReceiptDispute') {
    if (access.scope !== 'workerSelf') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return patchReportWorkerReceiptDispute(access, id, body)
  }

  if (body.action === 'correctDeliveryLines') {
    if (access.scope !== 'full' && access.scope !== 'deptLead') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return patchCorrectDeliveryLines(
      access.scope === 'full'
        ? { scope: 'full', userId: access.userId }
        : {
            scope: 'deptLead',
            userId: access.userId,
            leadDeptNorm: access.leadDeptNorm,
          },
      id,
      body
    )
  }

  if (access.scope === 'workerSelf') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dref = db.collection(DEL).doc(id)
  const dsnap = await dref.get()
  if (!dsnap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const cur = dsnap.data() as Record<string, unknown>
  if (!cur.deliveryWithoutRequest) {
    return NextResponse.json(
      { error: 'Només es pot vincular entregues marcades sense sol·licitud.' },
      { status: 400 }
    )
  }
  if (String(cur.requestId || '').trim()) {
    return NextResponse.json({ error: 'Aquesta entrega ja té sol·licitud.' }, { status: 400 })
  }

  const requestId = robaRequestDocIdFromInput(String(body.requestId || ''))
  if (!requestId) {
    return NextResponse.json({ error: 'Cal requestId.' }, { status: 400 })
  }

  const rref = db.collection(REQ).doc(requestId)
  const rsnap = await rref.get()
  if (!rsnap.exists) {
    return NextResponse.json({ error: 'Sol·licitud no trobada.' }, { status: 404 })
  }

  if (access.scope === 'deptLead') {
    const dw = String(cur.workerId || '').trim()
    if (dw) {
      const ws = await db.collection(WORK).doc(dw).get()
      const wdep = ws.exists
        ? String((ws.data() as { department?: string }).department || '').trim()
        : ''
      if (!departmentsInSameRobaScope(wdep, access.leadDeptNorm)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    const rd = String(
      (rsnap.data() as { requestingDepartment?: string })?.requestingDepartment || ''
    )
    if (!departmentsInSameRobaScope(rd, access.leadDeptNorm)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const rdata = rsnap.data() as Record<string, unknown>

  await dref.update({
    requestId,
    requestedLines: linesFromRequestSnapshot(rdata),
    deliveryWithoutRequest: false,
    linkedRequestAt: FieldValue.serverTimestamp(),
    linkedRequestByUserId: access.userId,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const next = await dref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res
  const access = auth.access
  if (access.scope !== 'full' || access.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const dref = db.collection(DEL).doc(id)
  const now = FieldValue.serverTimestamp()

  try {
    await db.runTransaction(async (tx) => {
      const dsnap = await tx.get(dref)
      if (!dsnap.exists) throw new Error('No trobat')

      const cur = dsnap.data() as Record<string, unknown>
      const lines = linesFromStoredDelivery(cur)
      if (lines.length === 0) {
        throw new Error('L entrega no te linies valides.')
      }

      const qtyByProduct = aggregateQuantities(lines)
      const requestId = String(cur.requestId || '').trim()

      let requestData: Record<string, unknown> | null = null
      let reqRef: DocumentReference | null = null
      let restoreReserved = false
      if (requestId) {
        reqRef = db.collection(REQ).doc(requestId)
        const rsnap = await tx.get(reqRef)
        if (!rsnap.exists) throw new Error('Sollicitud vinculada no trobada.')
        requestData = rsnap.data() as Record<string, unknown>
        const fulfillmentDeliveryId = String(requestData.fulfillmentDeliveryId || '').trim()
        if (fulfillmentDeliveryId && fulfillmentDeliveryId !== id) {
          throw new Error('La sollicitud ja no esta vinculada a aquesta entrega.')
        }
        restoreReserved =
          (requestData as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !==
          false
      }

      for (const [productId, qty] of qtyByProduct) {
        const pref = db.collection(PROD).doc(productId)
        const psnap = await tx.get(pref)
        if (!psnap.exists) throw new Error(`Producte no trobat: ${productId}`)
        const pdata = psnap.data() as Record<string, unknown>
        const onHand = Number((pdata as { quantityOnHand?: number }).quantityOnHand ?? 0)
        const reserved = Number((pdata as { quantityReserved?: number }).quantityReserved ?? 0)
        tx.update(pref, {
          quantityOnHand: onHand + qty,
          quantityReserved: requestId && restoreReserved ? reserved + qty : reserved,
          updatedAt: now,
        })

        const mref = db.collection(MOV).doc()
        tx.set(mref, {
          productId,
          quantityDelta: qty,
          reason: 'delivery_delete',
          reference: deliveryStockMovementReferenceFromDocId(mref.id),
          notes: `Eliminacio entrega ${String(cur.reference || `E-${id}`)}`,
          deliveryId: id,
          createdByUserId: access.userId,
          createdAt: now,
        })
      }

      if (reqRef && requestData) {
        tx.update(reqRef, {
          status: 'picked_up',
          fulfilledAt: null,
          fulfillmentDeliveryId: null,
          receiptConfirmedAt: null,
          updatedAt: now,
        })
      }

      tx.delete(dref)
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === 'No trobat' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}

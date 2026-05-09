export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { resolveRobaAccess } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { departmentsInSameRobaScope } from '@/lib/roba-personal/deptScope'
import {
  getUserDoc,
  normDeptLabel,
  userCanMarkRequestPickedUp,
  userCanMarkRequestPrepared,
} from '@/lib/roba-personal/requestPermissions'
import {
  notifyRobaDepartmentLeadsPickupDate,
  notifyRobaRequestMaterialReady,
} from '@/lib/roba-personal/robaRequestNotifications'
import { createRobaPickupCalendarEvent } from '@/services/graph/calendar'
import {
  deliveryStockMovementReferenceFromDocId,
  requestReferenceFromDocId,
  reservationStockMovementReferenceFromDocId,
} from '@/lib/roba-personal/dotacioReferenceCodes'

const COL = DOTACIO_COLLECTIONS.requests
const DEL = DOTACIO_COLLECTIONS.deliveries
const PROD = DOTACIO_COLLECTIONS.products
const MOV = DOTACIO_COLLECTIONS.stockMovements
const USERS = 'users'

const MAX_PICKUP_AVAILABILITY_MSG = 4000

async function departmentRobaLeadCalendarAttendees(
  requestingDepartment: string,
  excludeEmailsLower: Set<string>
): Promise<Array<{ email: string; name?: string }>> {
  const deptKey = normDeptLabel(requestingDepartment)
  if (!deptKey) return []
  const snap = await db.collection(USERS).where('departmentLower', '==', deptKey).get()
  const out: Array<{ email: string; name?: string }> = []
  for (const d of snap.docs) {
    const u = d.data() as {
      isDepartmentRobaLead?: boolean
      email?: string
      name?: string
    }
    if (u.isDepartmentRobaLead !== true) continue
    const email = String(u.email || '').trim()
    if (!email || excludeEmailsLower.has(email.toLowerCase())) continue
    const name = String(u.name || '').trim()
    out.push({ email, name: name || undefined })
  }
  return out
}

const TARGET_STATUSES = new Set(['prepared', 'picked_up', 'cancelled'])

type ReqLine = { productId: string; quantity: number }

function normalizeRequestLinesInput(linesIn: unknown): ReqLine[] {
  const arr = Array.isArray(linesIn) ? linesIn : []
  return arr
    .map((l) => ({
      productId: String((l as { productId?: string }).productId || '').trim(),
      quantity: Number((l as { quantity?: number }).quantity),
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
}

function mergeLinesByProduct(lines: ReqLine[]): ReqLine[] {
  const m = new Map<string, number>()
  for (const l of lines) {
    m.set(l.productId, (m.get(l.productId) || 0) + l.quantity)
  }
  return [...m.entries()].map(([productId, quantity]) => ({ productId, quantity }))
}

function parseLines(data: Record<string, unknown>): ReqLine[] {
  return normalizeRequestLinesInput(data.lines)
}

function mergeLineNotesFromDoc(
  d: Record<string, unknown>,
  lines: ReqLine[]
): Array<{ productId: string; quantity: number; notes?: string }> {
  const rawOld = Array.isArray(d.lines) ? d.lines : []
  const noteByPid = new Map<string, string>()
  for (const ol of rawOld) {
    const pid = String((ol as { productId?: string }).productId || '').trim()
    const n = String((ol as { notes?: string }).notes || '').trim()
    if (pid && n) noteByPid.set(pid, n)
  }
  return lines.map((l) => {
    const n = noteByPid.get(l.productId)
    return n ? { ...l, notes: n } : { ...l }
  })
}

function readProduct(data: Record<string, unknown> | undefined): {
  onHand: number
  reserved: number
} {
  const onHand = Number((data as { quantityOnHand?: number })?.quantityOnHand ?? 0)
  const reserved = Number((data as { quantityReserved?: number })?.quantityReserved ?? 0)
  return { onHand, reserved }
}

/** Documents sense `status` (antics) es tracten com a «submitted». Cal usar el mateix dins de transaccions. */
function effectiveRequestStatus(data: Record<string, unknown>): string {
  return String(data.status || 'submitted').trim()
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await resolveRobaAccess()
  if (!auth.ok) return auth.res
  const access = auth.access

  const { id } = await ctx.params
  const ref = db.collection(COL).doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const cur = snap.data() as Record<string, unknown>
  if (access.scope === 'deptLead') {
    const reqDept = String(cur.requestingDepartment || '')
    if (!departmentsInSameRobaScope(reqDept, access.leadDeptNorm)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  if (access.scope === 'workerSelf') {
    const pid = access.linkedPersonnelId
    const wk = String(cur.requestedByWorkerId || '').trim()
    const cr = String(cur.createdByUserId || '').trim()
    const own = (wk && wk === pid) || (cr && cr === access.userId)
    if (!own) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }
  const curStatus = effectiveRequestStatus(cur)

  const body = (await req.json()) as {
    status?: string
    notes?: string
    pickupDate?: string
    pickupAvailabilityMessage?: string
    prepareWithoutStockReservation?: boolean
    lines?: Array<{ productId?: string; quantity?: number }>
  }
  const now = FieldValue.serverTimestamp()

  if (body.notes !== undefined && body.status === undefined) {
    await ref.update({
      notes: String(body.notes || '').trim() || null,
      updatedAt: now,
    })
    const next = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
    )
  }

  if (body.status === undefined) {
    return NextResponse.json({ error: 'Cal status o notes.' }, { status: 400 })
  }

  const nextStatus = String(body.status || '').trim()
  if (!TARGET_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: 'Estat invàlid.' }, { status: 400 })
  }

  if (nextStatus === curStatus) {
    return NextResponse.json(
      serializeFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)
    )
  }

  /** ─── Cancel·lar ─── */
  if (nextStatus === 'cancelled') {
    if (curStatus === 'fulfilled' || curStatus === 'receipt_confirmed') {
      return NextResponse.json({ error: 'La sol·licitud ja consta com a lliurada o confirmada.' }, { status: 400 })
    }
    if (curStatus === 'prepared' || curStatus === 'picked_up') {
      try {
        await db.runTransaction(async (tx) => {
          const rs = await tx.get(ref)
          if (!rs.exists) throw new Error('Sol·licitud desapareguda.')
          const d = rs.data() as Record<string, unknown>
          const st = effectiveRequestStatus(d)
          if (st !== curStatus) throw new Error('Estat canviat; torneu a carregar.')
          const ls = parseLines(d)
          const hadStockReservation =
            (d as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !== false
          if (hadStockReservation) {
            const reqRefStr = requestReferenceFromDocId(id)
            const reqDept = String(d.requestingDepartment || '').trim() || null
            for (const line of ls) {
              const pref = db.collection(PROD).doc(line.productId)
              const ps = await tx.get(pref)
              if (!ps.exists) continue
              const { reserved } = readProduct(ps.data() as Record<string, unknown>)
              const nextRes = Math.max(0, reserved - line.quantity)
              tx.update(pref, {
                quantityReserved: nextRes,
                updatedAt: now,
              })
              const mref = db.collection(MOV).doc()
              tx.set(mref, {
                productId: line.productId,
                quantityDelta: 0,
                reason: 'request_reserve_release',
                reference: reservationStockMovementReferenceFromDocId(mref.id),
                notes: `Alliberament reserva (cancel·lació) ${reqRefStr} · ${line.quantity} u.`,
                requestId: id,
                createdByUserId: access.userId,
                createdAt: now,
                quantityReservedDelta: -line.quantity,
                productReservedAfter: nextRes,
                requestingDepartment: reqDept,
                workerDepartment: null,
              })
            }
          }
          tx.update(ref, {
            status: 'cancelled',
            cancelledAt: now,
            notes: body.notes !== undefined ? String(body.notes || '').trim() || null : d.notes,
            updatedAt: now,
          })
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e)
        return NextResponse.json({ error: message }, { status: 400 })
      }
    } else {
      await ref.update({
        status: 'cancelled',
        cancelledAt: now,
        notes: body.notes !== undefined ? String(body.notes || '').trim() || null : cur.notes,
        updatedAt: now,
      })
    }
    const out = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(out.id, out.data() as Record<string, unknown>)
    )
  }

  /** ─── Preparat (RRHH + reserva) ─── */
  if (nextStatus === 'prepared') {
    if (curStatus !== 'submitted') {
      return NextResponse.json(
        { error: 'Només es pot marcar «preparat» des de «submitted».' },
        { status: 400 }
      )
    }
    if (!(await userCanMarkRequestPrepared(access.userId, access.role))) {
      return NextResponse.json({ error: 'No autoritzat (cal RRHH o administrador).' }, { status: 403 })
    }
    const pickupDate = String(body.pickupDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
      return NextResponse.json(
        { error: 'Cal pickupDate (YYYY-MM-DD) per al calendari de recollida.' },
        { status: 400 }
      )
    }

    const msgRaw = String(body.pickupAvailabilityMessage || '').trim()
    const pickupAvailabilityMessage = msgRaw ? msgRaw.slice(0, MAX_PICKUP_AVAILABILITY_MSG) : null
    const skipStockReservation = Boolean(body.prepareWithoutStockReservation)
    const linesOverride =
      body.lines !== undefined ? mergeLinesByProduct(normalizeRequestLinesInput(body.lines)) : null
    if (linesOverride !== null && linesOverride.length === 0) {
      return NextResponse.json(
        { error: 'Cal almenys una línia vàlida per preparar.' },
        { status: 400 }
      )
    }

    try {
      await db.runTransaction(async (tx) => {
        const rs = await tx.get(ref)
        if (!rs.exists) throw new Error('Sol·licitud no trobada.')
        const d = rs.data() as Record<string, unknown>
        if (effectiveRequestStatus(d) !== 'submitted') throw new Error('Estat invàlid per preparar.')

        const ls =
          linesOverride !== null && linesOverride.length > 0 ? linesOverride : parseLines(d)
        if (ls.length === 0) throw new Error('La sol·licitud no té línies.')
        const linesToStore = mergeLineNotesFromDoc(d, ls)
        const originalRequestedLines =
          Array.isArray((d as { originalRequestedLines?: unknown[] }).originalRequestedLines) &&
          ((d as { originalRequestedLines?: unknown[] }).originalRequestedLines?.length ?? 0) > 0
            ? (d as { originalRequestedLines: unknown[] }).originalRequestedLines
            : Array.isArray(d.lines)
              ? d.lines
              : linesToStore

        if (!skipStockReservation) {
          const reqRefStr = requestReferenceFromDocId(id)
          const reqDept = String(d.requestingDepartment || '').trim() || null
          for (const line of ls) {
            const pref = db.collection(PROD).doc(line.productId)
            const ps = await tx.get(pref)
            if (!ps.exists) throw new Error(`Producte no trobat: ${line.productId}`)
            const { onHand, reserved } = readProduct(ps.data() as Record<string, unknown>)
            const available = onHand - reserved
            if (available < line.quantity) {
              throw new Error(
                `Estoc disponible insuficient per ${line.productId} (disponible ${available}, cal ${line.quantity}).`
              )
            }
            const nextReserved = reserved + line.quantity
            tx.update(pref, {
              quantityReserved: nextReserved,
              updatedAt: now,
            })
            const mref = db.collection(MOV).doc()
            tx.set(mref, {
              productId: line.productId,
              quantityDelta: 0,
              reason: 'request_reserve',
              reference: reservationStockMovementReferenceFromDocId(mref.id),
              notes: `Reserva ${reqRefStr} · ${line.quantity} u.`,
              requestId: id,
              createdByUserId: access.userId,
              createdAt: now,
              quantityReservedDelta: line.quantity,
              productReservedAfter: nextReserved,
              requestingDepartment: reqDept,
              workerDepartment: null,
            })
          }
        }

        tx.update(ref, {
          originalRequestedLines,
          lines: linesToStore,
          status: 'prepared',
          preparedAt: now,
          preparedByUserId: access.userId,
          pickupDate,
          pickupAvailabilityMessage,
          preparedWithStockReservation: !skipStockReservation,
          updatedAt: now,
        })
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const updatedSnap = await ref.get()
    const ud = updatedSnap.data() as Record<string, unknown>
    const createdBy = String(ud.createdByUserId || '').trim()
    const reference = String(ud.reference || '')
    const dept = String(ud.requestingDepartment || '')
    const workerName = String(ud.requestedByWorkerName || '').trim()
    const availMsgForNotify = pickupAvailabilityMessage || undefined

    if (createdBy) {
      try {
        await notifyRobaRequestMaterialReady({
          targetUserId: createdBy,
          requestId: id,
          reference,
          requestingDepartment: dept,
          pickupDate,
          workerName: workerName || undefined,
          pickupAvailabilityMessage: availMsgForNotify,
        })
      } catch (e) {
        console.error('[requests PATCH] notify ready', e)
      }
    }

    try {
      await notifyRobaDepartmentLeadsPickupDate({
        requestingDepartment: dept,
        excludeUserIds: createdBy ? [createdBy] : [],
        requestId: id,
        reference,
        pickupDate,
        workerName: workerName || undefined,
        pickupAvailabilityMessage: availMsgForNotify,
      })
    } catch (e) {
      console.error('[requests PATCH] notify dept leads', e)
    }

    try {
      const requester = createdBy ? await getUserDoc(createdBy) : null
      const email = String(requester?.email || '').trim()
      if (email) {
        const excludeAtt = new Set<string>([email.toLowerCase()])
        const additionalAttendees = await departmentRobaLeadCalendarAttendees(dept, excludeAtt)
        const ev = await createRobaPickupCalendarEvent({
          assigneeEmail: email,
          pickupDate,
          reference,
          requestingDepartment: dept,
          workerName: workerName || undefined,
          availabilityMessage: availMsgForNotify,
          additionalAttendees: additionalAttendees.length ? additionalAttendees : undefined,
        })
        if (ev.id) {
          await ref.update({
            pickupCalendarEventId: ev.id,
            pickupCalendarWebLink: ev.webLink || null,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }
    } catch (e) {
      console.error('[requests PATCH] calendar', e)
    }

    const final = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(final.id, final.data() as Record<string, unknown>)
    )
  }

  /** ─── Recollit (sol·licitant / responsable roba dept.) ─── */
  if (nextStatus === 'picked_up') {
    if (curStatus !== 'prepared') {
      return NextResponse.json(
        { error: 'Només es pot marcar «recollit» des de «preparat».' },
        { status: 400 }
      )
    }
    if (
      !(await userCanMarkRequestPickedUp(
        access.userId,
        {
          createdByUserId: String(cur.createdByUserId || ''),
          requestingDepartment: String(cur.requestingDepartment || ''),
          requestedByWorkerId: String(cur.requestedByWorkerId || ''),
        },
        access.role,
        access.scope === 'workerSelf'
          ? { linkedPersonnelId: access.linkedPersonnelId }
          : undefined
      ))
    ) {
      return NextResponse.json({ error: 'No autoritzat per marcar la recollida.' }, { status: 403 })
    }

    const linesOverride =
      body.lines !== undefined ? mergeLinesByProduct(normalizeRequestLinesInput(body.lines)) : null
    if (linesOverride !== null && linesOverride.length === 0) {
      return NextResponse.json(
        { error: 'Cal almenys una línia vàlida per registrar la recollida.' },
        { status: 400 }
      )
    }

    try {
      await db.runTransaction(async (tx) => {
        const rs = await tx.get(ref)
        if (!rs.exists) throw new Error('Sol·licitud no trobada.')
        const d = rs.data() as Record<string, unknown>
        if (effectiveRequestStatus(d) !== 'prepared') {
          throw new Error('Només es pot marcar «recollit» des de «preparat».')
        }

        const preparedLines = parseLines(d)
        const pickedLines =
          linesOverride !== null && linesOverride.length > 0 ? linesOverride : preparedLines
        if (pickedLines.length === 0) throw new Error('La sol·licitud no té línies.')
        const linesToStore = mergeLineNotesFromDoc(d, pickedLines)
        const hadStockReservation =
          (d as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !== false
        const preparedByProduct = new Map(preparedLines.map((line) => [line.productId, line.quantity]))
        const pickedByProduct = new Map(pickedLines.map((line) => [line.productId, line.quantity]))
        const allProductIds = new Set<string>([
          ...preparedByProduct.keys(),
          ...pickedByProduct.keys(),
        ])
        const reqRefStr = requestReferenceFromDocId(id)
        const reqDept = String(d.requestingDepartment || '').trim() || null

        for (const productId of allProductIds) {
          const preparedQty = preparedByProduct.get(productId) || 0
          const pickedQty = pickedByProduct.get(productId) || 0
          const pref = db.collection(PROD).doc(productId)
          const ps = await tx.get(pref)
          if (!ps.exists) throw new Error(`Producte no trobat: ${productId}`)
          const { onHand, reserved } = readProduct(ps.data() as Record<string, unknown>)
          const freeAvailable = Math.max(0, onHand - reserved)

          if (hadStockReservation) {
            if (reserved < preparedQty) {
              throw new Error(`Reserva insuficient per al producte ${productId}.`)
            }
            if (pickedQty > preparedQty + freeAvailable) {
              throw new Error(
                `No hi ha prou estoc disponible per recollir ${pickedQty} u. del producte ${productId}.`
              )
            }
          } else if (pickedQty > freeAvailable) {
            throw new Error(
              `No hi ha prou estoc disponible per recollir ${pickedQty} u. del producte ${productId}.`
            )
          }

          if (pickedQty > onHand) {
            throw new Error(`Estoc físic insuficient per al producte ${productId}.`)
          }

          const nextReserved = hadStockReservation ? Math.max(0, reserved - preparedQty) : reserved
          tx.update(pref, {
            quantityOnHand: onHand - pickedQty,
            quantityReserved: nextReserved,
            updatedAt: now,
          })

          const mref = db.collection(MOV).doc()
          tx.set(mref, {
            productId,
            quantityDelta: -pickedQty,
            reason: 'department_pickup',
            reference: deliveryStockMovementReferenceFromDocId(mref.id),
            notes: `Recollida departament ${reqRefStr} · ${pickedQty} u.`,
            requestId: id,
            createdByUserId: access.userId,
            createdAt: now,
            quantityReservedDelta: hadStockReservation ? -preparedQty : 0,
            productReservedAfter: nextReserved,
            requestingDepartment: reqDept,
            workerDepartment: reqDept,
          })
        }

        tx.update(ref, {
          lines: linesToStore,
          status: 'picked_up',
          pickedUpAt: now,
          pickedUpByUserId: access.userId,
          notes: body.notes !== undefined ? String(body.notes || '').trim() || null : d.notes,
          updatedAt: now,
        })
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const out = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(out.id, out.data() as Record<string, unknown>)
    )
  }

  return NextResponse.json({ error: 'Transició no implementada.' }, { status: 400 })
}

/**
 * Només administradors (mateix criteri que DELETE d’entregues): elimina el document
 * i allibera reserva d’estoc si la sol·licitud està preparada o recollida amb reserva.
 */
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
  const ref = db.collection(COL).doc(id)
  const now = FieldValue.serverTimestamp()

  const preSnap = await ref.get()
  if (!preSnap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }
  const pre = preSnap.data() as Record<string, unknown>
  const preStatus = effectiveRequestStatus(pre)
  if (preStatus === 'fulfilled' || preStatus === 'receipt_confirmed') {
    return NextResponse.json(
      {
        error:
          'No es pot eliminar una sol·licitud ja lliurada o confirmada. Elimineu primer l’entrega si escau.',
      },
      { status: 400 }
    )
  }
  const fulfillmentDeliveryId = String(
    (pre as { fulfillmentDeliveryId?: string }).fulfillmentDeliveryId || ''
  ).trim()
  if (fulfillmentDeliveryId) {
    return NextResponse.json(
      {
        error:
          'Aquesta sol·licitud té una entrega de compliment vinculada. Elimineu l’entrega primer.',
      },
      { status: 400 }
    )
  }

  const linkedDel = await db.collection(DEL).where('requestId', '==', id).limit(1).get()
  if (!linkedDel.empty) {
    return NextResponse.json(
      {
        error:
          'Aquesta sol·licitud té entregues vinculades. Elimineu-les abans (pestanya Entregues).',
      },
      { status: 400 }
    )
  }

  try {
    await db.runTransaction(async (tx) => {
      const rs = await tx.get(ref)
      if (!rs.exists) throw new Error('No trobat')
      const d = rs.data() as Record<string, unknown>
      const curStatus = effectiveRequestStatus(d)
      if (curStatus === 'fulfilled' || curStatus === 'receipt_confirmed') {
        throw new Error('Estat no permès per eliminar.')
      }
      const ls = parseLines(d)
      const hadStockReservation =
        (d as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !== false
      if ((curStatus === 'prepared' || curStatus === 'picked_up') && hadStockReservation) {
        const reqRefStr = requestReferenceFromDocId(id)
        const reqDept = String(d.requestingDepartment || '').trim() || null
        for (const line of ls) {
          const pref = db.collection(PROD).doc(line.productId)
          const ps = await tx.get(pref)
          if (!ps.exists) continue
          const { reserved } = readProduct(ps.data() as Record<string, unknown>)
          const nextRes = Math.max(0, reserved - line.quantity)
          tx.update(pref, {
            quantityReserved: nextRes,
            updatedAt: now,
          })
          const mref = db.collection(MOV).doc()
          tx.set(mref, {
            productId: line.productId,
            quantityDelta: 0,
            reason: 'request_reserve_release',
            reference: reservationStockMovementReferenceFromDocId(mref.id),
            notes: `Alliberament reserva (eliminació sol·licitud) ${reqRefStr} · ${line.quantity} u.`,
            requestId: id,
            createdByUserId: access.userId,
            createdAt: now,
            quantityReservedDelta: -line.quantity,
            productReservedAfter: nextRes,
            requestingDepartment: reqDept,
            workerDepartment: null,
          })
        }
      }
      tx.delete(ref)
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === 'No trobat' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}

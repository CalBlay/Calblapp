import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'

const DEL = DOTACIO_COLLECTIONS.deliveries
const REQ = DOTACIO_COLLECTIONS.requests
const WORK = DOTACIO_COLLECTIONS.workers

/** Extreu la referència d’entrega (E-…) de les notes dels moviments antics. */
export function parseDeliveryReferenceFromMovementNotes(notes: string): string | null {
  const s = String(notes || '')
  let m = s.match(/Entrega\s+(E-[A-Za-z0-9_-]+)/i)
  if (m) return m[1]
  m = s.match(/Eliminaci[oó]\s+entrega\s+(E-[A-Za-z0-9_-]+)/i)
  if (m) return m[1]
  return null
}

function isDeliveryLikeReason(reason: string): boolean {
  return (
    reason === 'delivery' || reason === 'delivery_correction' || reason === 'delivery_delete'
  )
}

/**
 * Omple departament i, si cal, reserva inferida per a moviments vinculats a entregues
 * (inclosos documents sense deliveryId ni camps de reserva).
 */
export async function enrichStockMovementsDeliveryContext<T extends { id: string }>(
  items: T[]
): Promise<T[]> {
  const deliveryIds = new Set<string>()
  const refsToResolve = new Set<string>()

  for (const row of items) {
    const r = row as Record<string, unknown>
    const reason = String(r.reason || '').trim()
    const did = String(r.deliveryId || '').trim()
    if (did) {
      deliveryIds.add(did)
      continue
    }
    if (isDeliveryLikeReason(reason)) {
      const pref = parseDeliveryReferenceFromMovementNotes(String(r.notes || ''))
      if (pref) refsToResolve.add(pref)
    }
  }

  const refToDelId = new Map<string, string>()
  await Promise.all(
    [...refsToResolve].map(async (ref) => {
      const snap = await db.collection(DEL).where('reference', '==', ref).limit(1).get()
      if (!snap.empty) refToDelId.set(ref, snap.docs[0].id)
    })
  )

  for (const id of refToDelId.values()) {
    deliveryIds.add(id)
  }

  const delById = new Map<string, Record<string, unknown>>()
  const idList = [...deliveryIds].filter(Boolean)
  for (let i = 0; i < idList.length; i += 10) {
    const chunk = idList.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(DEL).doc(id)))
    for (const s of snaps) {
      if (s.exists) delById.set(s.id, s.data() as Record<string, unknown>)
    }
  }

  const reqIds = new Set<string>()
  const workIds = new Set<string>()
  for (const d of delById.values()) {
    const rid = String(d.requestId || '').trim()
    if (rid) reqIds.add(rid)
    const wid = String(d.workerId || '').trim()
    if (wid) workIds.add(wid)
  }

  const reqById = new Map<string, Record<string, unknown>>()
  const reqIdList = [...reqIds]
  for (let i = 0; i < reqIdList.length; i += 10) {
    const chunk = reqIdList.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(REQ).doc(id)))
    for (const s of snaps) {
      if (s.exists) reqById.set(s.id, s.data() as Record<string, unknown>)
    }
  }

  const workById = new Map<string, Record<string, unknown>>()
  const workIdList = [...workIds]
  for (let i = 0; i < workIdList.length; i += 10) {
    const chunk = workIdList.slice(i, i + 10)
    const snaps = await db.getAll(...chunk.map((id) => db.collection(WORK).doc(id)))
    for (const s of snaps) {
      if (s.exists) workById.set(s.id, s.data() as Record<string, unknown>)
    }
  }

  function resolveDeliveryId(row: Record<string, unknown>): string {
    const did = String(row.deliveryId || '').trim()
    if (did) return did
    const reason = String(row.reason || '').trim()
    if (!isDeliveryLikeReason(reason)) return ''
    const pref = parseDeliveryReferenceFromMovementNotes(String(row.notes || ''))
    if (!pref) return ''
    return refToDelId.get(pref) || ''
  }

  return items.map((row) => {
    const r = row as Record<string, unknown>
    const delId = resolveDeliveryId(r)
    if (!delId) return row

    const del = delById.get(delId)
    if (!del) return row

    const rqId = String(del.requestId || '').trim()
    const req = rqId ? reqById.get(rqId) : undefined
    const wid = String(del.workerId || '').trim()
    const wk = wid ? workById.get(wid) : undefined

    const reqDept = req
      ? String((req as { requestingDepartment?: string }).requestingDepartment || '').trim()
      : ''
    const wDept = wk
      ? String((wk as { department?: string }).department || '').trim()
      : ''

    const out: Record<string, unknown> = { ...r }
    if (!String(out.requestingDepartment || '').trim() && reqDept) {
      out.requestingDepartment = reqDept
    }
    if (!String(out.workerDepartment || '').trim() && wDept) {
      out.workerDepartment = wDept
    }

    const hadRes =
      req != null &&
      (req as { preparedWithStockReservation?: boolean }).preparedWithStockReservation !== false
    const qtyD = Number(out.quantityDelta)
    const reason = String(out.reason || '').trim()
    const rdExisting = out.quantityReservedDelta
    const paExisting = out.productReservedAfter

    if (
      reason === 'delivery' &&
      hadRes &&
      rqId &&
      Number.isFinite(qtyD) &&
      qtyD < 0 &&
      (rdExisting === undefined || rdExisting === null) &&
      (paExisting === undefined || paExisting === null)
    ) {
      out.quantityReservedDelta = qtyD
    }

    /** Fase de recepció: el responsable ja ha registrat l’entrega però el treballador encara no l’ha confirmada. */
    if (reason === 'delivery') {
      const expect = del.workerReceiptAckExpected === true
      const ackDone = del.workerReceiptAckAt != null
      out.deliveryWorkerAckPending = Boolean(expect && !ackDone)
    }

    return out as T
  })
}

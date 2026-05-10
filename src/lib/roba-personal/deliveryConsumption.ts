import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'

export const CONSUMPTION_WINDOW_DAYS = 180

const DEL = DOTACIO_COLLECTIONS.deliveries

const CONSUMPTION_PAGE = 500
/** Límit de documents d’entrega llegits per al càlcul de consum (paginat per `deliveredAt`). */
const CONSUMPTION_MAX_DOCS = 20_000

/**
 * Suma unitats entregades per productId en entregues amb `deliveredAt` >= since.
 * Paginació per índex (no escaneig fix arbitrari); només compta documents amb `deliveredAt` definit.
 */
export async function sumDeliveredUnitsByProductSince(since: Date): Promise<Map<string, number>> {
  const sinceTs = Timestamp.fromDate(since)
  const out = new Map<string, number>()
  let last: QueryDocumentSnapshot | undefined
  let totalRead = 0

  while (totalRead < CONSUMPTION_MAX_DOCS) {
    const take = Math.min(CONSUMPTION_PAGE, CONSUMPTION_MAX_DOCS - totalRead)
    let q = db
      .collection(DEL)
      .where('deliveredAt', '>=', sinceTs)
      .orderBy('deliveredAt', 'asc')
      .limit(take)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>
      const lines = Array.isArray(data.lines) ? data.lines : []
      for (const ln of lines as { productId?: string; quantity?: number }[]) {
        const pid = String(ln.productId || '').trim()
        const qn = Number(ln.quantity)
        if (!pid || !Number.isFinite(qn) || qn <= 0) continue
        out.set(pid, (out.get(pid) ?? 0) + qn)
      }
    }

    totalRead += snap.size
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < take) break
  }

  return out
}

export function avgDailyFromSemesterTotal(q6: number, days: number): number {
  if (days <= 0) return 0
  return q6 / days
}

/** Dies fins a arribar a `minStock` si el consum diari és constant; null sense dades de consum. */
export function daysUntilMinimum(
  quantityOnHand: number,
  minStock: number,
  avgDaily: number
): number | null {
  if (avgDaily <= 0) {
    if (quantityOnHand <= minStock) return 0
    return null
  }
  if (quantityOnHand <= minStock) return 0
  return (quantityOnHand - minStock) / avgDaily
}

/**
 * Proposta semestral (2 comandes/any): cobrir dèficit fins al mínim + volum sortit en els darrers 6 mesos.
 */
export function suggestedSemesterOrderQty(
  quantityOnHand: number,
  minStock: number,
  deliveredLast6Months: number
): number {
  const shortfall = Math.max(0, minStock - quantityOnHand)
  return Math.ceil(shortfall + deliveredLast6Months)
}

export type DeliveredLineRollup = {
  deliveredAt: Date
  lines: Array<{ productId: string; quantity: number }>
}

export async function listDeliveredLineRollups(): Promise<DeliveredLineRollup[]> {
  const out: DeliveredLineRollup[] = []
  let last: QueryDocumentSnapshot | undefined
  let totalRead = 0

  while (totalRead < CONSUMPTION_MAX_DOCS) {
    const take = Math.min(CONSUMPTION_PAGE, CONSUMPTION_MAX_DOCS - totalRead)
    let q = db.collection(DEL).orderBy('deliveredAt', 'asc').limit(take)
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>
      const deliveredAtRaw = data.deliveredAt
      const deliveredAt =
        deliveredAtRaw instanceof Timestamp ? deliveredAtRaw.toDate() : null
      if (!deliveredAt) continue
      const rawLines = Array.isArray(data.lines) ? data.lines : []
      const lines = rawLines
        .map((ln) => ({
          productId: String((ln as { productId?: string }).productId || '').trim(),
          quantity: Number((ln as { quantity?: number }).quantity),
        }))
        .filter((ln) => ln.productId && Number.isFinite(ln.quantity) && ln.quantity > 0)
      if (lines.length === 0) continue
      out.push({ deliveredAt, lines })
    }

    totalRead += snap.size
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < take) break
  }

  return out
}

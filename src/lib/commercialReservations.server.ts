import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COMMERCIAL_RESERVATIONS_COLLECTION,
  getCommercialReservationDayKeys,
} from '@/lib/commercialReservations'

const MAX_QUERY_DAYS = 370

export async function queryCommercialReservationDocsByRange(
  start: string,
  end: string
): Promise<QueryDocumentSnapshot[]> {
  const dayKeys = getCommercialReservationDayKeys({ date: start, endDate: end })
  if (!dayKeys.length || dayKeys.length > MAX_QUERY_DAYS) {
    throw new Error(`El rang de reserves ha de ser d'entre 1 i ${MAX_QUERY_DAYS} dies.`)
  }

  const docs = new Map<string, QueryDocumentSnapshot>()
  const chunks: string[][] = []
  for (let offset = 0; offset < dayKeys.length; offset += 30) {
    chunks.push(dayKeys.slice(offset, offset + 30))
  }
  const snapshots = await Promise.all(
    chunks.map((chunk) =>
      db
        .collection(COMMERCIAL_RESERVATIONS_COLLECTION)
        .where('dayKeys', 'array-contains-any', chunk)
        .get()
    )
  )
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => docs.set(doc.id, doc))
  })
  return [...docs.values()]
}

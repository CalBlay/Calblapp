import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'

const COL = DOTACIO_COLLECTIONS.workers

export async function workerCodeTaken(
  code: string,
  excludeId?: string
): Promise<boolean> {
  const q = await db.collection(COL).where('code', '==', code).limit(5).get()
  return q.docs.some((d) => d.id !== excludeId)
}

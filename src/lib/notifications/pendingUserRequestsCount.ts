import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

/** Sol·licituds d'alta d'usuari pendents d'aprovació (font de veritat per al badge d'admin). */
export async function countPendingAdminUserRequests(): Promise<number> {
  try {
    const snap = await db.collection('userRequests').where('status', '==', 'pending').limit(200).get()
    return snap.size
  } catch (err) {
    console.error('[pendingUserRequestsCount]', err)
    return 0
  }
}

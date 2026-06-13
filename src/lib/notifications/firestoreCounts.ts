import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

const UNREAD_FETCH_LIMIT = 500

function notificationsRef(userId: string) {
  return db.collection('users').doc(userId).collection('notifications')
}

/** Una sola lectura sense índex compost: filtre per `read` i agrupació en memòria. */
export async function fetchUnreadNotificationDocs(
  userId: string
): Promise<QueryDocumentSnapshot[]> {
  const snap = await notificationsRef(userId)
    .where('read', '==', false)
    .limit(UNREAD_FETCH_LIMIT)
    .get()
  return snap.docs
}

export async function countUnreadNotifications(
  userId: string,
  options?: { type?: string }
): Promise<number> {
  const docs = await fetchUnreadNotificationDocs(userId)
  const typeFilter = options?.type ? String(options.type).trim() : ''
  return docs.filter((doc) => {
    if (!typeFilter) return true
    return String((doc.data() as { type?: string }).type || '').trim() === typeFilter
  }).length
}

export async function countUnreadNotificationsByTypes(
  userId: string,
  types: string[]
): Promise<number> {
  const uniqueTypes = new Set(types.map((t) => t.trim()).filter(Boolean))
  if (uniqueTypes.size === 0) return 0

  const docs = await fetchUnreadNotificationDocs(userId)
  return docs.filter((doc) =>
    uniqueTypes.has(String((doc.data() as { type?: string }).type || '').trim())
  ).length
}

import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { fetchUnreadNotificationDocs } from '@/lib/notifications/firestoreCounts'
import { PROJECT_NOTIFICATION_TYPES } from '@/lib/notifications/notificationTypes'
import {
  decrementUnreadFromNotificationDocs,
  setUserUnreadBucketCount,
} from '@/lib/notifications/unreadCounts'

const PROJECT_NOTIFICATION_TYPE_SET = new Set<string>(PROJECT_NOTIFICATION_TYPES)

type NotificationDoc = QueryDocumentSnapshot<FirebaseFirestore.DocumentData>

export async function pruneDeletedProjectNotifications(
  userId: string,
  docs: NotificationDoc[]
): Promise<NotificationDoc[]> {
  const projectDocs = docs.filter((doc) =>
    PROJECT_NOTIFICATION_TYPE_SET.has(String(doc.get('type') || '').trim())
  )
  if (projectDocs.length === 0) return docs

  const projectIds = [
    ...new Set(
      projectDocs
        .map((doc) => String(doc.get('projectId') || '').trim())
        .filter(Boolean)
    ),
  ]
  const projectSnaps = projectIds.length > 0
    ? await db.getAll(...projectIds.map((projectId) => db.collection('projects').doc(projectId)))
    : []
  const existingProjectIds = new Set(
    projectSnaps.filter((snap) => snap.exists).map((snap) => snap.id)
  )
  const staleDocs = projectDocs.filter((doc) => {
    const projectId = String(doc.get('projectId') || '').trim()
    return !projectId || !existingProjectIds.has(projectId)
  })
  if (staleDocs.length === 0) return docs

  await decrementUnreadFromNotificationDocs(userId, staleDocs)
  const batch = db.batch()
  staleDocs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()

  const staleIds = new Set(staleDocs.map((doc) => doc.id))
  return docs.filter((doc) => !staleIds.has(doc.id))
}

/** Recalcula el badge a partir de notificacions reals i elimina les orfes. */
export async function reconcileProjectNotificationCount(userId: string): Promise<number> {
  const unreadDocs = await fetchUnreadNotificationDocs(userId)
  const validDocs = await pruneDeletedProjectNotifications(userId, unreadDocs)
  const count = validDocs.filter((doc) =>
    PROJECT_NOTIFICATION_TYPE_SET.has(String(doc.get('type') || '').trim())
  ).length

  await setUserUnreadBucketCount(userId, 'projects', count)
  return count
}

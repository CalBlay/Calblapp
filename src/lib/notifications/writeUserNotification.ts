import type { DocumentReference } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { incrementUserUnreadCounts } from '@/lib/notifications/unreadCounts'

export type UserNotificationPayload = Record<string, unknown> & {
  type?: string
  read?: boolean
}

export function userNotificationRef(userId: string, docId?: string): DocumentReference {
  const col = db.collection('users').doc(userId).collection('notifications')
  return docId ? col.doc(docId) : col.doc()
}

/** Escriu una notificació i actualitza els comptadors denormalitzats. */
export async function writeUserNotification(
  userId: string,
  payload: UserNotificationPayload,
  options?: { docId?: string; merge?: boolean }
): Promise<string> {
  const ref = userNotificationRef(userId, options?.docId)
  const data = {
    ...payload,
    read: payload.read === true,
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Date.now(),
  }
  if (options?.merge) {
    await ref.set(data, { merge: true })
  } else {
    await ref.set(data)
  }
  if (!data.read && payload.type) {
    await incrementUserUnreadCounts([userId], String(payload.type), 1)
  }
  return ref.id
}

/** Batch: commit notificacions ja afegides al batch i incrementa comptadors. */
export async function afterNotificationsCommitted(
  entries: Array<{ userId: string; type: string; read?: boolean }>
): Promise<void> {
  const byType = new Map<string, string[]>()
  for (const entry of entries) {
    if (entry.read === true) continue
    const type = String(entry.type || '').trim()
    const userId = String(entry.userId || '').trim()
    if (!type || !userId) continue
    const list = byType.get(type) || []
    list.push(userId)
    byType.set(type, list)
  }
  await Promise.all(
    [...byType.entries()].map(([type, userIds]) => incrementUserUnreadCounts(userIds, type, 1))
  )
}

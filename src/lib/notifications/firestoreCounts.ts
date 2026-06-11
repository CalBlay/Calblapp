import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { Query } from 'firebase-admin/firestore'

function notificationsRef(userId: string) {
  return db.collection('users').doc(userId).collection('notifications')
}

async function countQuery(query: Query): Promise<number> {
  const snap = await query.count().get()
  return snap.data().count
}

export async function countUnreadNotifications(
  userId: string,
  options?: { type?: string }
): Promise<number> {
  let query: Query = notificationsRef(userId).where('read', '==', false)
  if (options?.type) {
    query = query.where('type', '==', options.type)
  }
  return countQuery(query)
}

export async function countUnreadNotificationsByTypes(
  userId: string,
  types: string[]
): Promise<number> {
  const uniqueTypes = [...new Set(types.map((t) => t.trim()).filter(Boolean))]
  if (uniqueTypes.length === 0) return 0
  if (uniqueTypes.length === 1) {
    return countUnreadNotifications(userId, { type: uniqueTypes[0] })
  }

  const ref = notificationsRef(userId)
  const counts = await Promise.all(
    chunk(uniqueTypes, 10).map((typeChunk) =>
      countQuery(ref.where('read', '==', false).where('type', 'in', typeChunk))
    )
  )
  return counts.reduce((sum, n) => sum + n, 0)
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { countUnreadNotifications, countUnreadNotificationsByTypes } from '@/lib/notifications/firestoreCounts'
import {
  INCIDENT_NOTIFICATION_TYPES,
  LOGISTICS_NOTIFICATION_TYPES,
  MAINTENANCE_NOTIFICATION_TYPES,
  PROJECT_NOTIFICATION_TYPES,
  TORN_NOTIFICATION_TYPES,
} from '@/lib/notifications/notificationTypes'

export const UNREAD_COUNTS_VERSION = 1

export type NotificationUnreadBuckets = {
  user_request: number
  user_request_result: number
  torn: number
  projects: number
  logistics: number
  maintenance: number
  incidents: number
  version: number
  syncedAt: number
}

type BucketKey = keyof Omit<NotificationUnreadBuckets, 'version' | 'syncedAt'>

export function bucketForNotificationType(type: string): BucketKey | null {
  const normalized = String(type || '').trim()
  if (!normalized) return null
  if (normalized === 'user_request') return 'user_request'
  if (normalized === 'user_request_result') return 'user_request_result'
  if (normalized === 'torn' || normalized === 'NEW_SHIFTS') return 'torn'
  if (
    normalized === 'project_assignment' ||
    normalized === 'project_block_assignment' ||
    normalized === 'project_task_assignment'
  ) {
    return 'projects'
  }
  if (
    normalized === 'commercial_vehicle_request' ||
    normalized === 'commercial_vehicle_validation'
  ) {
    return 'logistics'
  }
  if (
    normalized === 'maintenance_ticket_new' ||
    normalized === 'maintenance_ticket_assigned' ||
    normalized === 'maintenance_ticket_validated' ||
    normalized === 'maintenance_ticket_stale' ||
    normalized === 'maintenance_ticket_external_stale'
  ) {
    return 'maintenance'
  }
  if (normalized === 'incident_marketing_9xx_new') return 'incidents'
  return null
}

function userRef(userId: string) {
  return db.collection('users').doc(userId)
}

export async function incrementUserUnreadCount(
  userId: string,
  type: string,
  delta = 1
): Promise<void> {
  const bucket = bucketForNotificationType(type)
  if (!bucket || !userId || delta === 0) return
  await userRef(userId).set(
    {
      notificationUnread: {
        [bucket]: FieldValue.increment(delta),
        version: UNREAD_COUNTS_VERSION,
        syncedAt: Date.now(),
      },
    },
    { merge: true }
  )
}

export async function incrementUserUnreadCounts(
  userIds: string[],
  type: string,
  delta = 1
): Promise<void> {
  const bucket = bucketForNotificationType(type)
  if (!bucket || delta === 0) return
  const uniqueIds = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (uniqueIds.length === 0) return

  const batch = db.batch()
  const now = Date.now()
  for (const userId of uniqueIds) {
    batch.set(
      userRef(userId),
      {
        notificationUnread: {
          [bucket]: FieldValue.increment(delta),
          version: UNREAD_COUNTS_VERSION,
          syncedAt: now,
        },
      },
      { merge: true }
    )
  }
  await batch.commit()
}

export async function decrementUserUnreadCount(
  userId: string,
  type: string,
  delta = 1
): Promise<void> {
  await incrementUserUnreadCount(userId, type, -Math.abs(delta))
}

export async function readUserUnreadBuckets(userId: string): Promise<NotificationUnreadBuckets | null> {
  const snap = await userRef(userId).get()
  if (!snap.exists) return null
  const raw = (snap.data() as { notificationUnread?: Partial<NotificationUnreadBuckets> })
    ?.notificationUnread
  if (!raw || raw.version !== UNREAD_COUNTS_VERSION) return null

  return {
    user_request: Math.max(0, Number(raw.user_request || 0)),
    user_request_result: Math.max(0, Number(raw.user_request_result || 0)),
    torn: Math.max(0, Number(raw.torn || 0)),
    projects: Math.max(0, Number(raw.projects || 0)),
    logistics: Math.max(0, Number(raw.logistics || 0)),
    maintenance: Math.max(0, Number(raw.maintenance || 0)),
    incidents: Math.max(0, Number(raw.incidents || 0)),
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Number(raw.syncedAt || 0),
  }
}

export async function syncUserUnreadBuckets(userId: string): Promise<NotificationUnreadBuckets> {
  const [
    user_request,
    user_request_result,
    torn,
    projects,
    logistics,
    maintenance,
    incidents,
  ] = await Promise.all([
    countUnreadNotifications(userId, { type: 'user_request' }),
    countUnreadNotifications(userId, { type: 'user_request_result' }),
    countUnreadNotificationsByTypes(userId, [...TORN_NOTIFICATION_TYPES]),
    countUnreadNotificationsByTypes(userId, [...PROJECT_NOTIFICATION_TYPES]),
    countUnreadNotificationsByTypes(userId, [...LOGISTICS_NOTIFICATION_TYPES]),
    countUnreadNotificationsByTypes(userId, [...MAINTENANCE_NOTIFICATION_TYPES]),
    countUnreadNotificationsByTypes(userId, [...INCIDENT_NOTIFICATION_TYPES]),
  ])

  const buckets: NotificationUnreadBuckets = {
    user_request,
    user_request_result,
    torn,
    projects,
    logistics,
    maintenance,
    incidents,
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Date.now(),
  }

  await userRef(userId).set({ notificationUnread: buckets }, { merge: true })
  return buckets
}

export async function getUserUnreadBuckets(userId: string): Promise<NotificationUnreadBuckets> {
  const cached = await readUserUnreadBuckets(userId)
  if (cached) return cached
  return syncUserUnreadBuckets(userId)
}

function countNotificationTypes(docs: DocumentSnapshot[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const doc of docs) {
    if (!doc.exists) continue
    const data = doc.data() as { type?: string; read?: boolean }
    if (data.read === true) continue
    const type = String(data.type || '').trim()
    if (!type) continue
    counts.set(type, (counts.get(type) || 0) + 1)
  }
  return counts
}

export async function decrementUnreadFromNotificationDocs(
  userId: string,
  docs: DocumentSnapshot[]
): Promise<void> {
  const typeCounts = countNotificationTypes(docs)
  if (typeCounts.size === 0) return

  const bucketDeltas = new Map<BucketKey, number>()
  for (const [type, count] of typeCounts) {
    const bucket = bucketForNotificationType(type)
    if (!bucket) continue
    bucketDeltas.set(bucket, (bucketDeltas.get(bucket) || 0) - count)
  }
  if (bucketDeltas.size === 0) return

  const notificationUnread: Record<string, unknown> = {
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Date.now(),
  }
  for (const [bucket, delta] of bucketDeltas) {
    notificationUnread[bucket] = FieldValue.increment(delta)
  }

  await userRef(userId).set({ notificationUnread }, { merge: true })
}

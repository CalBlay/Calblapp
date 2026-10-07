import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { countUnreadNotificationsByTypes } from '@/lib/notifications/firestoreCounts'
import { userDocRefByAuthId } from '@/lib/notifications/userNotificationsRef'

export const UNREAD_COUNTS_VERSION = 3

export type NotificationUnreadBuckets = {
  user_request: number
  user_request_result: number
  torn: number
  projects: number
  logistics: number
  maintenance: number
  deco: number
  incidents: number
  events: number
  version: number
  syncedAt: number
}

type BucketKey = keyof Omit<NotificationUnreadBuckets, 'version' | 'syncedAt'>

const NOTIFICATION_TYPES_BY_BUCKET: Record<BucketKey, readonly string[]> = {
  user_request: ['user_request'],
  user_request_result: ['user_request_result'],
  torn: ['torn', 'NEW_SHIFTS'],
  projects: [
    'project_assignment',
    'project_block_assignment',
    'project_task_assignment',
    'project_task_dependency_unlocked',
  ],
  logistics: ['commercial_vehicle_request', 'commercial_vehicle_validation'],
  maintenance: [
    'maintenance_ticket_new',
    'maintenance_ticket_assigned',
    'maintenance_ticket_resolved',
    'maintenance_ticket_pending_cap_validation',
    'maintenance_ticket_validated',
    'maintenance_ticket_reopened',
    'maintenance_ticket_stale',
    'maintenance_ticket_external_stale',
  ],
  deco: [
    'deco_ticket_new',
    'deco_ticket_assigned',
    'deco_ticket_resolved',
    'deco_ticket_pending_cap_validation',
    'deco_ticket_validated',
    'deco_ticket_reopened',
  ],
  incidents: ['incident_marketing_9xx_new', 'incident_action_assigned'],
  events: ['event_comanda_warehouse', 'event_comanda_batch_sent'],
}

export async function setUserUnreadBucketCount(
  userId: string,
  bucket: BucketKey,
  count: number
): Promise<void> {
  if (!userId) return
  const ref = await userDocRefByAuthId(userId)
  await ref.set(
    {
      notificationUnread: {
        [bucket]: Math.max(0, Math.floor(count)),
        syncedAt: Date.now(),
      },
    },
    { merge: true }
  )
}

export function bucketForNotificationType(type: string): BucketKey | null {
  const normalized = String(type || '').trim()
  if (!normalized) return null
  if (normalized === 'user_request') return 'user_request'
  if (normalized === 'user_request_result') return 'user_request_result'
  if (normalized === 'torn' || normalized === 'NEW_SHIFTS') return 'torn'
  if (
    normalized === 'project_assignment' ||
    normalized === 'project_block_assignment' ||
    normalized === 'project_task_assignment' ||
    normalized === 'project_task_dependency_unlocked'
  ) {
    return 'projects'
  }
  if (normalized === 'commercial_vehicle_request' || normalized === 'commercial_vehicle_validation') {
    return 'logistics'
  }
  if (normalized === 'event_comanda_warehouse') return 'events'
  if (normalized === 'event_comanda_batch_sent') return 'events'
  if (
    normalized === 'maintenance_ticket_new' ||
    normalized === 'maintenance_ticket_assigned' ||
    normalized === 'maintenance_ticket_resolved' ||
    normalized === 'maintenance_ticket_pending_cap_validation' ||
    normalized === 'maintenance_ticket_validated' ||
    normalized === 'maintenance_ticket_reopened' ||
    normalized === 'maintenance_ticket_stale' ||
    normalized === 'maintenance_ticket_external_stale'
  ) {
    return 'maintenance'
  }
  if (
    normalized === 'deco_ticket_new' ||
    normalized === 'deco_ticket_assigned' ||
    normalized === 'deco_ticket_resolved' ||
    normalized === 'deco_ticket_pending_cap_validation' ||
    normalized === 'deco_ticket_validated' ||
    normalized === 'deco_ticket_reopened'
  ) {
    return 'deco'
  }
  if (normalized === 'incident_marketing_9xx_new' || normalized === 'incident_action_assigned') {
    return 'incidents'
  }
  return null
}

export async function incrementUserUnreadCount(
  userId: string,
  type: string,
  delta = 1
): Promise<void> {
  const bucket = bucketForNotificationType(type)
  if (!bucket || !userId || delta === 0) return
  const ref = await userDocRefByAuthId(userId)
  await ref.set(
    {
      notificationUnread: {
        [bucket]: FieldValue.increment(delta),
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
    const ref = await userDocRefByAuthId(userId)
    batch.set(
      ref,
      {
        notificationUnread: {
          [bucket]: FieldValue.increment(delta),
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
  const ref = await userDocRefByAuthId(userId)
  const snap = await ref.get()
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
    deco: Math.max(0, Number(raw.deco || 0)),
    incidents: Math.max(0, Number(raw.incidents || 0)),
    events: Math.max(0, Number(raw.events || 0)),
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Number(raw.syncedAt || 0),
  }
}

export async function syncUserUnreadBuckets(userId: string): Promise<NotificationUnreadBuckets> {
  const bucketKeys = Object.keys(NOTIFICATION_TYPES_BY_BUCKET) as BucketKey[]
  const counts = await Promise.all(
    bucketKeys.map((bucket) =>
      countUnreadNotificationsByTypes(userId, [...NOTIFICATION_TYPES_BY_BUCKET[bucket]])
    )
  )
  const counted = Object.fromEntries(
    bucketKeys.map((bucket, index) => [bucket, counts[index]])
  ) as Record<BucketKey, number>

  const buckets: NotificationUnreadBuckets = {
    ...counted,
    version: UNREAD_COUNTS_VERSION,
    syncedAt: Date.now(),
  }

  const ref = await userDocRefByAuthId(userId)
  await ref.set({ notificationUnread: buckets }, { merge: true })
  return buckets
}

const EMPTY_BUCKETS = (): NotificationUnreadBuckets => ({
  user_request: 0,
  user_request_result: 0,
  torn: 0,
  projects: 0,
  logistics: 0,
  maintenance: 0,
  deco: 0,
  incidents: 0,
  events: 0,
  version: UNREAD_COUNTS_VERSION,
  syncedAt: Date.now(),
})

export async function getUserUnreadBuckets(userId: string): Promise<NotificationUnreadBuckets> {
  try {
    const cached = await readUserUnreadBuckets(userId)
    if (cached) return cached
    return await syncUserUnreadBuckets(userId)
  } catch (err) {
    console.error('[unreadCounts] getUserUnreadBuckets failed for', userId, err)
    return EMPTY_BUCKETS()
  }
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
    syncedAt: Date.now(),
  }
  for (const [bucket, delta] of bucketDeltas) {
    notificationUnread[bucket] = FieldValue.increment(delta)
  }

  const ref = await userDocRefByAuthId(userId)
  await ref.set({ notificationUnread }, { merge: true })
}

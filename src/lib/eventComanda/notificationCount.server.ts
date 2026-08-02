import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import {
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import type { EventComandaBatchStatus, EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'
import { decrementUnreadFromNotificationDocs } from '@/lib/notifications/unreadCounts'

const NOTIFICATION_TYPE = 'event_comanda_warehouse'
const NOTIFICATION_TYPE_BATCH_SENT = 'event_comanda_batch_sent'
const ORDERS_COL = EVENT_COMANDA_COLLECTIONS.orders

/** Només aquests estats mantenen el badge (noves / pendents de preparar). */
const BADGE_BATCH_STATUSES = new Set<EventComandaBatchStatus>([
  'pending',
  'in_progress',
  'issue',
])

type OrderDoc = {
  batches?: EventComandaOrderBatch[]
}

function batchIdentity(batch: EventComandaOrderBatch) {
  return String(batch.batchId || batch.warehouseId || '').trim()
}

function findBatchForNotification(
  batches: EventComandaOrderBatch[] | undefined,
  params: { warehouseId: string; batchId?: string }
) {
  if (!batches?.length) return null
  const warehouseKey = warehouseDocId(params.warehouseId)
  const batchId = String(params.batchId || '').trim()

  if (batchId) {
    return (
      batches.find((batch) => batchIdentity(batch) === batchId) ||
      batches.find((batch) => warehouseDocId(batch.warehouseId) === warehouseKey) ||
      null
    )
  }

  return (
    batches.find(
      (batch) =>
        warehouseDocId(batch.warehouseId) === warehouseKey && batch.kind !== 'revision'
    ) ||
    batches.find((batch) => warehouseDocId(batch.warehouseId) === warehouseKey) ||
    null
  )
}

/**
 * Compta notificacions de comanda que encara requereixen acció i elimina les obsoletes
 * (lots preparats, enviats o anul·lats). Inclou notificacions «enviada» per al sol·licitant.
 */
export async function reconcileEventComandaNotificationCount(userId: string): Promise<number> {
  const uid = String(userId || '').trim()
  if (!uid) return 0

  const [preparerCount, requesterCount] = await Promise.all([
    reconcilePreparerWarehouseNotificationCount(uid),
    countUnreadRequesterBatchSentNotifications(uid),
  ])
  return preparerCount + requesterCount
}

async function countUnreadRequesterBatchSentNotifications(userId: string): Promise<number> {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .where('type', '==', NOTIFICATION_TYPE_BATCH_SENT)
    .where('read', '==', false)
    .limit(200)
    .get()
  return snap.size
}

async function reconcilePreparerWarehouseNotificationCount(userId: string): Promise<number> {
  const assignedWarehouseIds = await listWarehouseIdsForUser(userId)
  const allowed = new Set(assignedWarehouseIds.map((id) => warehouseDocId(id)))
  if (!allowed.size) return 0

  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .where('type', '==', NOTIFICATION_TYPE)
    .where('read', '==', false)
    .limit(500)
    .get()

  if (!snap.docs.length) return 0

  const orderCache = new Map<string, OrderDoc | null>()
  const toDelete: QueryDocumentSnapshot[] = []
  let actionable = 0

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>
    const eventId = String(data.eventId || '').trim()
    const warehouseId = warehouseDocId(String(data.warehouseId || ''))
    if (!eventId || !allowed.has(warehouseId)) {
      toDelete.push(doc)
      continue
    }

    let order = orderCache.get(eventId)
    if (order === undefined) {
      const orderSnap = await db.collection(ORDERS_COL).doc(eventId).get()
      order = orderSnap.exists ? (orderSnap.data() as OrderDoc) : null
      orderCache.set(eventId, order)
    }

    const batch = findBatchForNotification(order?.batches, {
      warehouseId,
      batchId: String(data.batchId || '').trim() || undefined,
    })

    if (!batch || !batch.lines.length) {
      toDelete.push(doc)
      continue
    }

    const status = normalizeEventComandaBatchStatus(batch.status)
    if (BADGE_BATCH_STATUSES.has(status)) {
      actionable += 1
    } else {
      toDelete.push(doc)
    }
  }

  if (toDelete.length) {
    const batch = db.batch()
    for (const doc of toDelete) {
      batch.delete(doc.ref)
    }
    await batch.commit()
    await decrementUnreadFromNotificationDocs(userId, toDelete)
  }

  return actionable
}

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { resolveEventDisplayName } from '@/lib/eventDisplayName'
import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import type { OrderUpdateNotification } from '@/lib/eventComanda/orderLines.server'
import { getWarehouseMembers } from '@/lib/eventComanda/warehouseMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'
import { writeUserNotification } from '@/lib/notifications/writeUserNotification'
import { decrementUnreadFromNotificationDocs } from '@/lib/notifications/unreadCounts'
import { sendPushToUsers } from '@/lib/notifications/sendUserPush.server'
import { getAblyRest, hasAblyApiKey } from '@/lib/server/ablyRest'

const NOTIFICATION_TYPE = 'event_comanda_warehouse'
const NOTIFICATION_TYPE_BATCH_SENT = 'event_comanda_batch_sent'

function notifyPushInBackground(params: {
  userId: string
  title: string
  body: string
  url: string
}) {
  void sendPushToUsers([params.userId], {
    title: params.title,
    body: params.body,
    url: params.url,
  }).catch((error) => {
    console.error('[eventComandaNotifications] push error', error)
  })
}

async function notifyMember(params: {
  userId: string
  notification: Record<string, unknown>
  docId: string
  merge: boolean
  ablyPayload: Record<string, unknown>
}) {
  await writeUserNotification(params.userId, params.notification, {
    docId: params.docId,
    merge: params.merge,
  })

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      await rest.channels
        .get(`user:${params.userId}:notifications`)
        .publish('created', params.ablyPayload)
    } catch (error) {
      console.error('[eventComandaNotifications] Ably publish error', error)
    }
  }
}

async function resolveEventTitle(eventId: string): Promise<string> {
  try {
    const snap = await db.collection('stage_verd').doc(eventId).get()
    if (!snap.exists) return eventId
    return resolveEventDisplayName(snap.data() as Record<string, unknown>, eventId)
  } catch {
    return eventId
  }
}

function resolveBaseUrl(): string | null {
  const url = String(process.env.NEXTAUTH_URL || '').trim()
  return url || null
}

function formatModifiedLineSummary(line: OrderUpdateNotification['modifiedLines'][number]) {
  const unit = String(line.qtyUnit || '').trim()
  const unitSuffix = unit ? ` ${unit}` : ''
  if (line.qtyRequestedBefore == null) {
    return `${line.articleName}: ${line.qtyRequested}${unitSuffix} (nou)`
  }
  if (line.qtyRequested <= 0) {
    return `${line.articleName}: eliminat (abans ${line.qtyRequestedBefore}${unitSuffix})`
  }
  return `${line.articleName}: ${line.qtyRequestedBefore}${unitSuffix} → ${line.qtyRequested}${unitSuffix}`
}

export async function notifyWarehouseMembersForOrderUpdate(params: {
  eventId: string
  eventTitle?: string | null
  sentByUserId?: string | null
  sentByName?: string | null
  notifications: OrderUpdateNotification[]
}) {
  const eventId = String(params.eventId || '').trim()
  if (!eventId || !params.notifications.length) {
    return { notifiedUsers: 0, batches: 0 }
  }

  const eventTitle =
    String(params.eventTitle || '').trim() || (await resolveEventTitle(eventId))
  const sentBy = String(params.sentByName || '').trim()
  const now = Date.now()
  let notifiedUsers = 0

  const memberTasks: Array<Promise<void>> = []

  for (const notice of params.notifications) {
    const warehouseId = warehouseDocId(notice.warehouseId)
    if (!warehouseId || !notice.modifiedLines.length) continue

    const members = (await getWarehouseMembers(warehouseId)).members
    if (!members.length) continue

    const warehouseLabel = String(notice.warehouseName || notice.warehouseCode || warehouseId).trim()
    const isRevision = notice.variant === 'revision'
    const title = isRevision ? 'Nova comanda addicional' : 'Línies modificades en preparació'
    const lineSummaries = notice.modifiedLines.slice(0, 3).map(formatModifiedLineSummary)
    const extraCount = Math.max(0, notice.modifiedLines.length - 3)
    const bodyParts = [
      isRevision
        ? `Comanda addicional per ${eventTitle} (${warehouseLabel}).`
        : `Canvis en comanda en preparació per ${eventTitle} (${warehouseLabel}).`,
      ...lineSummaries,
    ]
    if (extraCount > 0) {
      bodyParts.push(`+${extraCount} línies més`)
    }
    const body = bodyParts.join(' ')

    const url = `/menu/events/${encodeURIComponent(eventId)}/comanda`
    const notificationDocId = `${eventId}__${notice.batchId}__${now}`

    for (const member of members) {
      const userId = String(member.userId || '').trim()
      if (!userId) continue

      memberTasks.push(
        notifyMember({
          userId,
          docId: notificationDocId,
          merge: false,
          notification: {
            type: NOTIFICATION_TYPE,
            title,
            body,
            eventId,
            eventTitle,
            warehouseId,
            warehouseCode: notice.warehouseCode,
            warehouseName: notice.warehouseName,
            batchId: notice.batchId,
            modifiedLines: notice.modifiedLines,
            lineCount: notice.modifiedLines.length,
            sentBy: sentBy || null,
            sentByUserId: params.sentByUserId || null,
            url,
            createdAt: now,
            read: false,
          },
          ablyPayload: {
            type: NOTIFICATION_TYPE,
            eventId,
            warehouseId,
            batchId: notice.batchId,
            createdAt: now,
          },
        })
      )

      notifyPushInBackground({ userId, title, body, url })
      notifiedUsers += 1
    }
  }

  await Promise.all(memberTasks)

  return {
    notifiedUsers,
    batches: params.notifications.length,
  }
}

export async function notifyWarehouseMembersForOrderSent(params: {
  eventId: string
  eventTitle?: string | null
  sentByUserId?: string | null
  sentByName?: string | null
  batches: EventComandaOrderBatch[]
  variant?: 'sent' | 'updated'
}) {
  const eventId = String(params.eventId || '').trim()
  if (!eventId || !params.batches.length) {
    return { notifiedUsers: 0, batches: 0 }
  }

  const eventTitle =
    String(params.eventTitle || '').trim() || (await resolveEventTitle(eventId))
  const sentBy = String(params.sentByName || '').trim()
  const now = Date.now()
  let notifiedUsers = 0

  const memberTasks: Array<Promise<void>> = []

  for (const batch of params.batches) {
    const warehouseId = warehouseDocId(batch.warehouseId)
    if (!warehouseId || !batch.lines.length) continue

    const members = (await getWarehouseMembers(warehouseId)).members
    if (!members.length) continue

    const lineCount = batch.lines.length
    const warehouseLabel = String(batch.warehouseName || batch.warehouseCode || warehouseId).trim()
    const isUpdate = params.variant === 'updated'
    const title = isUpdate ? 'Comanda actualitzada' : 'Nova comanda de magatzem'
    const body = isUpdate
      ? lineCount === 1
        ? `S'ha modificat 1 article per ${eventTitle} (${warehouseLabel}).`
        : `S'han modificat ${lineCount} articles per ${eventTitle} (${warehouseLabel}).`
      : lineCount === 1
        ? `1 article a preparar per ${eventTitle} (${warehouseLabel}).`
        : `${lineCount} articles a preparar per ${eventTitle} (${warehouseLabel}).`

    const url = `/menu/events/${encodeURIComponent(eventId)}/comanda`
    const notificationDocId = `${eventId}__${warehouseId}`

    for (const member of members) {
      const userId = String(member.userId || '').trim()
      if (!userId) continue

      memberTasks.push(
        notifyMember({
          userId,
          docId: notificationDocId,
          merge: true,
          notification: {
            type: NOTIFICATION_TYPE,
            title,
            body,
            eventId,
            eventTitle,
            warehouseId,
            warehouseCode: batch.warehouseCode,
            warehouseName: batch.warehouseName,
            lineCount,
            sentBy: sentBy || null,
            sentByUserId: params.sentByUserId || null,
            url,
            createdAt: now,
            read: false,
          },
          ablyPayload: {
            type: NOTIFICATION_TYPE,
            eventId,
            warehouseId,
            createdAt: now,
          },
        })
      )

      notifyPushInBackground({ userId, title, body, url })
      notifiedUsers += 1
    }
  }

  await Promise.all(memberTasks)

  return {
    notifiedUsers,
    batches: params.batches.length,
  }
}

/** Elimina notificacions de comanda de magatzem per l'usuari (p. ex. en marcar preparada/enviada). */
export async function dismissEventComandaWarehouseNotificationsForUser(params: {
  userId: string
  eventId: string
  warehouseId?: string
  batchId?: string
}) {
  const userId = String(params.userId || '').trim()
  const eventId = String(params.eventId || '').trim()
  if (!userId || !eventId) return { dismissed: 0 }

  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('notifications')
    .where('type', '==', NOTIFICATION_TYPE)
    .where('read', '==', false)
    .limit(200)
    .get()

  const warehouseKey = warehouseDocId(params.warehouseId || '')
  const batchId = String(params.batchId || '').trim()
  const batch = db.batch()
  const toDismiss = snap.docs.filter((doc) => {
    const data = doc.data() as Record<string, unknown>
    if (String(data.eventId || '').trim() !== eventId) return false
    if (warehouseKey && warehouseDocId(String(data.warehouseId || '')) !== warehouseKey) {
      return false
    }
    if (batchId) {
      const docBatchId = String(data.batchId || '').trim()
      if (docBatchId && docBatchId !== batchId) return false
    }
    return true
  })

  if (!toDismiss.length) return { dismissed: 0 }

  for (const doc of toDismiss) {
    batch.delete(doc.ref)
  }
  await batch.commit()
  await decrementUnreadFromNotificationDocs(userId, toDismiss)
  return { dismissed: toDismiss.length }
}

/** Notifica el sol·licitant quan el magatzem marca un lot com enviat. */
export async function notifyRequesterBatchSent(params: {
  eventId: string
  eventTitle?: string | null
  requesterUserId: string
  warehouseId: string
  warehouseCode?: string | null
  warehouseName?: string | null
  batchId?: string | null
  lineCount?: number
  preparedByName?: string | null
  preparedByUserId?: string | null
}) {
  const eventId = String(params.eventId || '').trim()
  const requesterUserId = String(params.requesterUserId || '').trim()
  if (!eventId || !requesterUserId) return { notified: false }

  const eventTitle =
    String(params.eventTitle || '').trim() || (await resolveEventTitle(eventId))
  const warehouseLabel = String(
    params.warehouseName || params.warehouseCode || params.warehouseId || ''
  ).trim()
  const preparedBy = String(params.preparedByName || '').trim()
  const lineCount = Math.max(0, Number(params.lineCount || 0))
  const title = "Comanda enviada a l'esdeveniment"
  const body = preparedBy
    ? `${preparedBy} ha marcat com enviada la comanda de ${warehouseLabel} per ${eventTitle}.`
    : `La comanda de ${warehouseLabel} per ${eventTitle} s'ha marcat com enviada.`

  const url = `/menu/events/${encodeURIComponent(eventId)}/comanda`
  const batchId = String(params.batchId || warehouseDocId(params.warehouseId)).trim()
  const now = Date.now()
  const notificationDocId = `${eventId}__${batchId}__sent`

  await writeUserNotification(
    requesterUserId,
    {
      type: NOTIFICATION_TYPE_BATCH_SENT,
      title,
      body,
      eventId,
      eventTitle,
      warehouseId: warehouseDocId(params.warehouseId),
      warehouseCode: params.warehouseCode ?? null,
      warehouseName: params.warehouseName ?? null,
      batchId,
      lineCount: lineCount || null,
      preparedBy: preparedBy || null,
      preparedByUserId: params.preparedByUserId ?? null,
      url,
      createdAt: now,
      read: false,
    },
    { docId: notificationDocId, merge: true }
  )

  if (hasAblyApiKey()) {
    try {
      const rest = getAblyRest()
      await rest.channels.get(`user:${requesterUserId}:notifications`).publish('created', {
        type: NOTIFICATION_TYPE_BATCH_SENT,
        eventId,
        warehouseId: warehouseDocId(params.warehouseId),
        batchId,
        createdAt: now,
      })
    } catch (error) {
      console.error('[eventComandaNotifications] Ably publish error', error)
    }
  }

  const baseUrl = resolveBaseUrl()
  if (baseUrl) {
    notifyPushInBackground({
      userId: requesterUserId,
      title,
      body,
      url,
    })
  }

  return { notified: true }
}

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { getEventComandaOrder } from '@/lib/eventComanda/order.server'
import { listWarehouseIdsForUser } from '@/lib/eventComanda/warehouseMembers.server'
import { hasEventsComandaPreparerOnlyAccess } from '@/lib/eventComanda/permissionsAccess.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'
import type { AccessUser } from '@/lib/accessControl'
import {
  buildEventComandaRoomId,
  eventComandaBatchIdentity,
  resolveEventComandaBatchChannelId,
} from '@/lib/messaging/eventComandaChatIds'
import {
  visibleComandaBatchesForViewer,
} from '@/lib/messaging/comandaChat.server'
import { normalizeRole } from '@/lib/roles'
import { isComandaWarehouseChatActive } from '@/lib/eventComanda/batchStatus'

export type EventOpsRoom = {
  roomId: string
  type: 'production' | 'comanda'
  label: string
  channelId: string
  unreadCount: number
  warehouseId?: string
  warehouseCode?: string
  warehouseName?: string
  canManageMembers?: boolean
  requesterUserName?: string | null
  batchStatus?: string
  batchId?: string
  chatActive?: boolean
}

type EventOpsAccessUser = AccessUser & { id: string }

async function fetchEventMeta(eventId: string) {
  const snap = await db.collection('stage_verd').doc(eventId).get()
  if (!snap.exists) {
    return { code: '', name: eventId, commercialName: '' }
  }
  const data = snap.data() as Record<string, unknown>
  return {
    code: String(data?.code || data?.Code || data?.Codi || '').trim(),
    name: String(data?.NomEvent || data?.eventName || data?.name || eventId).trim(),
    commercialName: String(
      data?.Comercial || data?.comercial || data?.Commercial || ''
    ).trim(),
  }
}

async function getUnreadCount(channelId: string, userId: string) {
  const snap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .where('userId', '==', userId)
    .limit(1)
    .get()
  if (snap.empty) return 0
  const unread = Number((snap.docs[0].data() as { unreadCount?: number })?.unreadCount || 0)
  return Number.isFinite(unread) ? unread : 0
}

async function canListProductionRoom(params: {
  eventId: string
  userId: string
  role: string
  eventMeta: { code: string; commercialName: string }
}) {
  const role = normalizeRole(params.role)
  if (role === 'admin' || role === 'direccio') {
    return Boolean(params.eventMeta.code && params.eventMeta.commercialName)
  }

  if (!params.eventMeta.code || !params.eventMeta.commercialName) return false

  const channelId = `event_${params.eventId}`
  const memberSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .where('userId', '==', params.userId)
    .limit(1)
    .get()
  if (!memberSnap.empty) return true

  const userSnap = await db.collection('users').doc(params.userId).get()
  const userData = userSnap.data() as {
    opsEventsConfigurable?: boolean
    opsEventsEnabled?: boolean
  }
  if (userData?.opsEventsConfigurable === false) return false
  if (userData?.opsEventsEnabled === false) return false
  return Boolean(userData?.opsEventsConfigurable)
}

export async function listEventOpsRooms(params: {
  eventId: string
  user: EventOpsAccessUser
}): Promise<EventOpsRoom[]> {
  const eventId = String(params.eventId || '').trim()
  if (!eventId) return []

  const userId = params.user.id
  const role = normalizeRole(params.user.role)
  const preparerOnly = await hasEventsComandaPreparerOnlyAccess(params.user)
  const assignedWarehouseIds = await listWarehouseIdsForUser(userId)
  const eventMeta = await fetchEventMeta(eventId)
  const rooms: EventOpsRoom[] = []

  if (await canListProductionRoom({ eventId, userId, role, eventMeta })) {
    const channelId = `event_${eventId}`
    rooms.push({
      roomId: 'production',
      type: 'production',
      label: 'Producció',
      channelId,
      unreadCount: await getUnreadCount(channelId, userId),
    })
  }

  const order = await getEventComandaOrder(eventId)
  if (order?.sentAt) {
    const visibleBatches = visibleComandaBatchesForViewer({
      batches: order.batches,
      preparerOnly,
      userId,
      role,
      assignedWarehouseIds,
    })

    const seenBatches = new Set<string>()
    const uniqueBatches = visibleBatches.filter((batch) => {
      const batchKey = eventComandaBatchIdentity(batch)
      if (!batchKey || seenBatches.has(batchKey)) return false
      seenBatches.add(batchKey)
      return Boolean(warehouseDocId(batch.warehouseId))
    })

    const comandaRooms = await Promise.all(
      uniqueBatches.map(async (batch) => {
        const warehouseKey = warehouseDocId(batch.warehouseId)
        const batchKey = eventComandaBatchIdentity(batch)
        const channelId = resolveEventComandaBatchChannelId(eventId, batch)
        const warehouseLabel =
          batch.warehouseName?.trim() && batch.warehouseCode?.trim()
            ? `${batch.warehouseName} · ${batch.warehouseCode}`
            : batch.warehouseName?.trim() || batch.warehouseCode?.trim() || 'Magatzem'
        const batchStatus = String(batch.status || 'pending')
        const chatActive = isComandaWarehouseChatActive(batchStatus)
        const label =
          batch.kind === 'revision'
            ? `Comanda add. · ${warehouseLabel}`
            : `Comanda · ${warehouseLabel}`

        return {
          roomId: buildEventComandaRoomId(warehouseKey, batchKey),
          type: 'comanda' as const,
          label,
          channelId,
          unreadCount: await getUnreadCount(channelId, userId),
          warehouseId: warehouseKey,
          batchId: batchKey,
          warehouseCode: batch.warehouseCode,
          warehouseName: batch.warehouseName,
          requesterUserName: order.sentByUserName || null,
          batchStatus,
          chatActive,
        }
      })
    )

    rooms.push(...comandaRooms)
  }

  return rooms
}

export async function userHasEventOpsAccess(params: {
  eventId: string
  user: EventOpsAccessUser
}) {
  const rooms = await listEventOpsRooms(params)
  return rooms.length > 0
}

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { capDepartmentMatchesIncidentOrigin } from '@/lib/incidentOriginDepartments'
import { getEventComandaOrder, type EventComandaOrderDoc } from '@/lib/eventComanda/order.server'
import {
  isComandaWarehouseChatActive,
  normalizeEventComandaBatchStatus,
} from '@/lib/eventComanda/batchStatus'
import {
  filterBatchesForPreparerHistoryView,
  filterBatchesForPreparerView,
  getWarehouseMembers,
} from '@/lib/eventComanda/warehouseMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { normalizeRole } from '@/lib/roles'
import {
  buildEventComandaChannelId,
  buildEventComandaRoomId,
  eventComandaBatchIdentity,
  parseEventComandaRoomId,
  resolveEventComandaBatchChannelId,
} from '@/lib/messaging/eventComandaChatIds'

const ORDERS_COL = EVENT_COMANDA_COLLECTIONS.orders

export {
  buildEventComandaChannelId,
  buildEventComandaRoomId,
  buildEventComandaRoomIdFromBatch,
  eventComandaBatchIdentity,
  parseEventComandaRoomId,
  resolveEventComandaBatchChannelId,
} from '@/lib/messaging/eventComandaChatIds'

type ChatMember = { userId: string; userName: string }

async function fetchUserDisplayNames(uids: string[]) {
  const map = new Map<string, string>()
  const unique = [...new Set(uids.filter(Boolean))]
  const chunkSize = 10
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const snaps = await db.getAll(...chunk.map((uid) => db.collection('users').doc(uid)))
    snaps.forEach((doc) => {
      if (!doc.exists) return
      const data = doc.data() as { name?: string; email?: string }
      const name = String(data?.name || data?.email || doc.id).trim()
      if (name) map.set(doc.id, name)
    })
  }
  return map
}

async function getUserDepartment(userId: string): Promise<string> {
  if (!userId) return ''
  const snap = await db.collection('users').doc(userId).get()
  if (!snap.exists) return ''
  return String((snap.data() as { department?: string })?.department || '').trim()
}

async function fetchEventMeta(eventId: string) {
  const snap = await db.collection('stage_verd').doc(eventId).get()
  if (!snap.exists) {
    return { code: '', name: eventId, location: '' }
  }
  const data = snap.data() as Record<string, unknown>
  const code = String(data?.code || data?.Code || data?.Codi || '').trim()
  const name = String(data?.NomEvent || data?.eventName || data?.name || '').trim()
  const location = String(data?.Ubicacio || data?.location || '').trim()
  const commercialName = String(
    data?.Comercial || data?.comercial || data?.Commercial || ''
  ).trim()
  return { code, name: name || eventId, location, commercialName }
}

function batchesForWarehouse(order: EventComandaOrderDoc, warehouseId: string) {
  const warehouseKey = warehouseDocId(warehouseId)
  return (order.batches || []).filter(
    (batch) => warehouseDocId(batch.warehouseId) === warehouseKey
  )
}

export function findBatchForComandaChat(
  order: EventComandaOrderDoc,
  warehouseId: string,
  batchId?: string | null
): EventComandaOrderBatch | null {
  const warehouseKey = warehouseDocId(warehouseId)
  const batches = batchesForWarehouse(order, warehouseKey)
  if (!batches.length) return null

  const batchKey = String(batchId || '').trim()
  if (batchKey) {
    const match = batches.find((batch) => eventComandaBatchIdentity(batch) === batchKey)
    if (match) return match
  }

  return batches.find((batch) => batch.kind !== 'revision') || batches[0] || null
}

/** @deprecated Usa findBatchForComandaChat */
export function representativeBatchForWarehouse(order: EventComandaOrderDoc, warehouseId: string) {
  return findBatchForComandaChat(order, warehouseId)
}

export async function canAccessEventComandaChat(params: {
  eventId: string
  userId: string
  role: string
  preparerOnly: boolean
  assignedWarehouseIds: string[]
  warehouseId?: string | null
  batchId?: string | null
}): Promise<{ ok: boolean; order: EventComandaOrderDoc | null }> {
  const order = await getEventComandaOrder(params.eventId)
  if (!order?.sentAt) return { ok: false, order: null }

  const viewer = {
    userId: params.userId,
    role: normalizeRole(params.role),
    assignedWarehouseIds: params.assignedWarehouseIds,
  }

  const visibleActive = filterBatchesForPreparerView(order.batches, viewer)
  const visibleHistory = filterBatchesForPreparerHistoryView(order.batches, viewer)
  const visibleBatches = params.preparerOnly
    ? [...visibleActive, ...visibleHistory]
    : order.batches

  if (!visibleBatches.length) return { ok: false, order }

  const scopedWarehouseId = warehouseDocId(params.warehouseId || '')
  if (scopedWarehouseId) {
    const scopedBatchId = String(params.batchId || '').trim()
    const allowed = visibleBatches.some((batch) => {
      if (warehouseDocId(batch.warehouseId) !== scopedWarehouseId) return false
      if (!scopedBatchId) return true
      return eventComandaBatchIdentity(batch) === scopedBatchId
    })
    return { ok: allowed, order }
  }

  return { ok: true, order }
}

export async function canManageEventComandaChatMembers(params: {
  order: EventComandaOrderDoc
  userId: string
  role: string
  channelId: string
}): Promise<boolean> {
  const role = normalizeRole(params.role)
  if (role === 'admin' || role === 'direccio') return true

  const requesterId = String(params.order.sentByUserId || '').trim()
  if (requesterId && requesterId === params.userId) return true

  if (role !== 'cap') return false

  const [requesterDept, capDept] = await Promise.all([
    getUserDepartment(requesterId),
    getUserDepartment(params.userId),
  ])
  if (!capDepartmentMatchesIncidentOrigin(requesterDept, capDept)) return false

  const memberSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', params.channelId)
    .where('userId', '==', params.userId)
    .limit(1)
    .get()

  return !memberSnap.empty
}

async function collectBatchChatMemberIds(
  order: EventComandaOrderDoc,
  batch: EventComandaOrderBatch
): Promise<string[]> {
  const memberIds = new Set<string>()
  const requesterId = String(order.sentByUserId || '').trim()
  if (requesterId) memberIds.add(requesterId)

  const warehouseKey = warehouseDocId(batch.warehouseId)
  const { members } = await getWarehouseMembers(warehouseKey)
  for (const member of members) {
    if (member.userId) memberIds.add(member.userId)
  }

  for (const extraId of batch.chatExtraMemberIds || []) {
    const id = String(extraId || '').trim()
    if (id) memberIds.add(id)
  }

  return [...memberIds]
}

async function persistBatchChannelId(params: {
  eventId: string
  batchId: string
  channelId: string
}) {
  const order = await getEventComandaOrder(params.eventId)
  if (!order) return

  const batchKey = String(params.batchId || '').trim()
  const batches = order.batches.map((batch) =>
    eventComandaBatchIdentity(batch) === batchKey
      ? { ...batch, opsChannelId: params.channelId }
      : batch
  )

  await db.collection(ORDERS_COL).doc(params.eventId).set({ batches }, { merge: true })
}

function batchChannelLabel(batch: EventComandaOrderBatch, eventMeta: { code: string; name: string }) {
  const warehouseLabel =
    batch.warehouseName?.trim() && batch.warehouseCode?.trim()
      ? `${batch.warehouseName} · ${batch.warehouseCode}`
      : batch.warehouseName?.trim() || batch.warehouseCode?.trim() || 'Magatzem'
  const prefix = batch.kind === 'revision' ? 'Comanda add.' : 'Comanda'
  return eventMeta.code
    ? `${prefix} · ${warehouseLabel} · ${eventMeta.code}`
    : `${prefix} · ${warehouseLabel} · ${eventMeta.name}`
}

export async function syncEventComandaBatchChatChannel(
  eventId: string,
  warehouseId: string,
  batchId: string
) {
  const trimmedEventId = String(eventId || '').trim()
  const warehouseKey = warehouseDocId(warehouseId)
  const batchKey = String(batchId || '').trim()
  if (!trimmedEventId) throw new Error('Event id required.')
  if (!warehouseKey || !batchKey) throw new Error('Lot de magatzem no vàlid.')

  const order = await getEventComandaOrder(trimmedEventId)
  if (!order?.sentAt) throw new Error('Comanda no enviada.')

  const batch = findBatchForComandaChat(order, warehouseKey, batchKey)
  if (!batch) throw new Error('Lot de magatzem no trobat.')

  const now = Date.now()
  const channelId = resolveEventComandaBatchChannelId(trimmedEventId, batch)
  const memberIds = await collectBatchChatMemberIds(order, batch)
  const nameMap = await fetchUserDisplayNames(memberIds)

  const finalMembers: ChatMember[] = memberIds
    .map((userId) => ({
      userId,
      userName: nameMap.get(userId) || userId,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName, 'ca', { sensitivity: 'base' }))

  const eventMeta = await fetchEventMeta(trimmedEventId)
  const channelLabel = batchChannelLabel(batch, eventMeta)

  const channelRef = db.collection('channels').doc(channelId)
  const channelSnap = await channelRef.get()
  const newOnlyData = channelSnap.exists
    ? {}
    : {
        lastMessagePreview: '',
        lastMessageAt: 0,
        createdAt: now,
        createdBy: 'system',
      }

  await channelRef.set(
    {
      name: channelLabel,
      type: 'group',
      source: 'event_comanda',
      location: eventMeta.location || eventMeta.name,
      eventId: trimmedEventId,
      eventCode: eventMeta.code || null,
      eventTitle: eventMeta.name,
      warehouseId: warehouseKey,
      warehouseCode: batch.warehouseCode || null,
      warehouseName: batch.warehouseName || null,
      batchId: eventComandaBatchIdentity(batch),
      orderSentAt: order.sentAt,
      requesterUserId: order.sentByUserId || null,
      requesterUserName: order.sentByUserName || null,
      status: 'active',
      updatedAt: now,
      ...newOnlyData,
    },
    { merge: true }
  )

  const existingMembersSnap = await db
    .collection('channelMembers')
    .where('channelId', '==', channelId)
    .get()

  const existingByUserId = new Map(
    existingMembersSnap.docs.map((doc) => {
      const data = doc.data() as { userId?: string }
      return [String(data.userId || ''), doc] as const
    })
  )
  const nextMemberIds = new Set(finalMembers.map((member) => member.userId))

  const writeBatch = db.batch()

  for (const member of finalMembers) {
    const ref = db.collection('channelMembers').doc(`${channelId}_${member.userId}`)
    const existing = existingByUserId.get(member.userId)
    const currentData = existing?.data() as Record<string, unknown> | undefined
    writeBatch.set(
      ref,
      {
        channelId,
        userId: member.userId,
        userName: member.userName,
        role: 'member',
        joinedAt: Number(currentData?.joinedAt || now),
        unreadCount: Number(currentData?.unreadCount || 0),
        muted: Boolean(currentData?.muted),
        hidden: Boolean(currentData?.hidden),
        notify: currentData?.notify !== false,
      },
      { merge: true }
    )
  }

  for (const doc of existingMembersSnap.docs) {
    const data = doc.data() as { userId?: string }
    const userId = String(data.userId || '')
    if (!userId || nextMemberIds.has(userId)) continue
    writeBatch.delete(doc.ref)
  }

  await writeBatch.commit()
  await persistBatchChannelId({
    eventId: trimmedEventId,
    batchId: eventComandaBatchIdentity(batch),
    channelId,
  })

  return {
    channelId,
    memberCount: finalMembers.length,
    warehouseId: warehouseKey,
    batchId: eventComandaBatchIdentity(batch),
  }
}

/** @deprecated Usa syncEventComandaBatchChatChannel */
export async function syncEventComandaWarehouseChatChannel(
  eventId: string,
  warehouseId: string
) {
  const order = await getEventComandaOrder(eventId)
  const batch = order ? findBatchForComandaChat(order, warehouseId) : null
  if (!batch) throw new Error('Lot de magatzem no trobat.')
  return syncEventComandaBatchChatChannel(
    eventId,
    warehouseId,
    eventComandaBatchIdentity(batch)
  )
}

export async function syncEventComandaChatChannels(eventId: string) {
  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) return []

  const results = []
  for (const batch of order.batches || []) {
    const warehouseKey = warehouseDocId(batch.warehouseId)
    const batchKey = eventComandaBatchIdentity(batch)
    if (!warehouseKey || !batchKey) continue

    const status = normalizeEventComandaBatchStatus(batch.status)
    try {
      if (isComandaWarehouseChatActive(status)) {
        results.push(
          await syncEventComandaBatchChatChannel(eventId, warehouseKey, batchKey)
        )
      } else if (status === 'sent' || status === 'cancelled') {
        const archived = await archiveEventComandaBatchChatChannel(
          eventId,
          warehouseKey,
          batchKey
        )
        if (archived) results.push(archived)
      }
    } catch (error) {
      console.error(
        '[syncEventComandaChatChannels] batch sync failed',
        warehouseKey,
        batchKey,
        error
      )
    }
  }
  return results
}

/** @deprecated Use syncEventComandaChatChannels */
export async function syncEventComandaChatChannel(eventId: string) {
  const results = await syncEventComandaChatChannels(eventId)
  if (!results.length) throw new Error('Comanda no enviada.')
  return results[0]
}

export async function addEventComandaChatMember(params: {
  eventId: string
  warehouseId: string
  batchId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const eventId = String(params.eventId || '').trim()
  const warehouseKey = warehouseDocId(params.warehouseId)
  const batchKey = String(params.batchId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!eventId) throw new Error('Event id required.')
  if (!warehouseKey || !batchKey) throw new Error('Lot de magatzem no vàlid.')
  if (!targetUserId) throw new Error('Cal seleccionar un usuari.')

  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) throw new Error('Comanda no enviada.')

  const batch = findBatchForComandaChat(order, warehouseKey, batchKey)
  if (!batch) throw new Error('Lot de magatzem no trobat.')

  const channelId = resolveEventComandaBatchChannelId(eventId, batch)

  const canManage = await canManageEventComandaChatMembers({
    order,
    userId: params.actorUserId,
    role: params.actorRole,
    channelId,
  })
  if (!canManage) throw new Error('Sense permís per afegir participants.')

  const batches = order.batches.map((entry) => {
    if (eventComandaBatchIdentity(entry) !== eventComandaBatchIdentity(batch)) return entry
    const extraIds = new Set(
      (entry.chatExtraMemberIds || []).map((id) => String(id || '').trim()).filter(Boolean)
    )
    extraIds.add(targetUserId)
    return { ...entry, chatExtraMemberIds: [...extraIds] }
  })

  await db.collection(ORDERS_COL).doc(eventId).set({ batches }, { merge: true })

  return syncEventComandaBatchChatChannel(eventId, warehouseKey, eventComandaBatchIdentity(batch))
}

export async function removeEventComandaChatMember(params: {
  eventId: string
  warehouseId: string
  batchId: string
  targetUserId: string
  actorUserId: string
  actorRole: string
}) {
  const eventId = String(params.eventId || '').trim()
  const warehouseKey = warehouseDocId(params.warehouseId)
  const batchKey = String(params.batchId || '').trim()
  const targetUserId = String(params.targetUserId || '').trim()
  if (!eventId) throw new Error('Event id required.')
  if (!warehouseKey || !batchKey) throw new Error('Lot de magatzem no vàlid.')
  if (!targetUserId) throw new Error('Cal seleccionar un usuari.')

  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) throw new Error('Comanda no enviada.')

  const batch = findBatchForComandaChat(order, warehouseKey, batchKey)
  if (!batch) throw new Error('Lot de magatzem no trobat.')

  const channelId = resolveEventComandaBatchChannelId(eventId, batch)

  const canManage = await canManageEventComandaChatMembers({
    order,
    userId: params.actorUserId,
    role: params.actorRole,
    channelId,
  })
  if (!canManage) throw new Error('Sense permís per treure participants.')

  const isExtra = (batch.chatExtraMemberIds || []).map(String).includes(targetUserId)
  if (!isExtra) {
    throw new Error('Només es poden treure participants afegits manualment.')
  }

  const batches = order.batches.map((entry) => {
    if (eventComandaBatchIdentity(entry) !== eventComandaBatchIdentity(batch)) return entry
    return {
      ...entry,
      chatExtraMemberIds: (entry.chatExtraMemberIds || []).filter(
        (id) => String(id || '').trim() !== targetUserId
      ),
    }
  })

  await db.collection(ORDERS_COL).doc(eventId).set({ batches }, { merge: true })

  return syncEventComandaBatchChatChannel(eventId, warehouseKey, eventComandaBatchIdentity(batch))
}

export async function searchEventComandaChatUsers(query: string, limit = 20) {
  const q = String(query || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  const snap = await db.collection('users').get()
  const users = snap.docs
    .map((doc) => {
      const data = doc.data() as { name?: string; email?: string; nameFold?: string }
      const name = String(data.name || data.email || '').trim()
      if (!name) return null
      const fold = String(data.nameFold || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
      const haystack = fold || name.toLowerCase()
      if (q && !haystack.includes(q)) return null
      return { id: doc.id, name }
    })
    .filter(Boolean) as Array<{ id: string; name: string }>

  users.sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }))
  return users.slice(0, Math.max(1, Math.min(limit, 50)))
}

export async function archiveEventComandaBatchChatChannel(
  eventId: string,
  warehouseId: string,
  batchId: string
) {
  const trimmedEventId = String(eventId || '').trim()
  const warehouseKey = warehouseDocId(warehouseId)
  const batchKey = String(batchId || '').trim()
  if (!trimmedEventId || !warehouseKey || !batchKey) return null

  const order = await getEventComandaOrder(trimmedEventId)
  const batch = order ? findBatchForComandaChat(order, warehouseKey, batchKey) : null
  const channelId = batch
    ? resolveEventComandaBatchChannelId(trimmedEventId, batch)
    : buildEventComandaChannelId(trimmedEventId, warehouseKey, batchKey)
  const now = Date.now()

  await db.collection('channels').doc(channelId).set(
    {
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
    },
    { merge: true }
  )

  return { channelId, warehouseId: warehouseKey, batchId: batchKey }
}

/** @deprecated Usa archiveEventComandaBatchChatChannel */
export async function archiveEventComandaWarehouseChatChannel(
  eventId: string,
  warehouseId: string
) {
  const order = await getEventComandaOrder(eventId)
  const batch = order ? findBatchForComandaChat(order, warehouseId) : null
  if (!batch) return null
  return archiveEventComandaBatchChatChannel(
    eventId,
    warehouseId,
    eventComandaBatchIdentity(batch)
  )
}

export function visibleComandaBatchesForViewer(params: {
  batches: EventComandaOrderBatch[]
  preparerOnly: boolean
  userId: string
  role: string
  assignedWarehouseIds: string[]
}) {
  const viewer = {
    userId: params.userId,
    role: normalizeRole(params.role),
    assignedWarehouseIds: params.assignedWarehouseIds,
  }

  if (!params.preparerOnly) return params.batches || []

  const active = filterBatchesForPreparerView(params.batches, viewer)
  const history = filterBatchesForPreparerHistoryView(params.batches, viewer)
  const seen = new Set<string>()
  return [...active, ...history].filter((batch) => {
    const key = eventComandaBatchIdentity(batch)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

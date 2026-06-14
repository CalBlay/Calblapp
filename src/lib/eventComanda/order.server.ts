import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { articleDocId } from '@/lib/eventComanda/articles.server'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import type {
  EventComandaBatchStatus,
  EventComandaOrderBatch,
  EventComandaOrderBatchLine,
  EventComandaOrderLine,
  EventComandaOrderStatus,
  EventComandaStatus,
} from '@/lib/eventComanda/types'
import {
  listEventComandaWarehouseRules,
  resolveWarehouseIdForArticleCode,
} from '@/lib/eventComanda/warehouseRules.server'
import {
  deriveOrderStatusFromBatches,
  normalizeEventComandaBatchStatus,
  normalizeEventComandaOrderBatches,
} from '@/lib/eventComanda/batchStatus'
import {
  isValidDeliveryDate,
  normalizeDeliveryTimeSlot,
} from '@/lib/eventComanda/deliverySlots'
import { assertEventComandaDeliveryDateAndSlot } from '@/lib/eventComanda/eventDeliveryBounds.server'
import {
  computeOrderWarehouseIndex,
  orderWarehouseIndexIsMissing,
} from '@/lib/eventComanda/orderWarehouseIndex'
import { applyOrderUpdate, applyAdditionalWarehouseLines } from '@/lib/eventComanda/orderLines.server'
import {
  notifyWarehouseMembersForOrderSent,
  notifyWarehouseMembersForOrderUpdate,
  dismissEventComandaWarehouseNotificationsForUser,
  notifyRequesterBatchSent,
} from '@/lib/eventComanda/notifications.server'
import { reconcileEventComandaNotificationCount } from '@/lib/eventComanda/notificationCount.server'
import { listEventComandaWarehouses, warehouseDocId } from '@/lib/eventComanda/warehouses.server'
import {
  archiveEventComandaBatchChatChannel,
  syncEventComandaChatChannels,
} from '@/lib/messaging/comandaChat.server'

const COL = EVENT_COMANDA_COLLECTIONS.orders
const ARTICLES_COL = EVENT_COMANDA_COLLECTIONS.articles

const UNASSIGNED_WAREHOUSE_ID = '_UNASSIGNED'

export type EventComandaOrderDoc = {
  eventId: string
  status: EventComandaOrderStatus
  sentAt: number
  sentByUserId?: string | null
  sentByUserName?: string | null
  updatedAt?: number | null
  updatedByUserId?: string | null
  updatedByUserName?: string | null
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  comments?: string | null
  batches: EventComandaOrderBatch[]
  lineCount: number
  batchCount: number
  warehouseIds?: string[]
  preparerVisibleWarehouseIds?: string[]
  preparerHistoryWarehouseIds?: string[]
}

export async function getEventComandaOrder(eventId: string): Promise<EventComandaOrderDoc | null> {
  const snap = await db.collection(COL).doc(eventId).get()
  if (!snap.exists) return null
  const data = snap.data() as EventComandaOrderDoc
  const batches = normalizeEventComandaOrderBatches(data.batches) ?? []
  const order: EventComandaOrderDoc = {
    ...data,
    batches,
  }

  if (orderWarehouseIndexIsMissing(order)) {
    const index = computeOrderWarehouseIndex(batches)
    try {
      await db.collection(COL).doc(eventId).update(index)
    } catch (error) {
      console.error('[getEventComandaOrder] warehouse index backfill failed', error)
    }
    return { ...order, ...index }
  }

  return order
}

export function orderToComandaStatus(
  order: EventComandaOrderDoc | null,
  hasTemplate: boolean
): EventComandaStatus {
  if (!order) return hasTemplate ? 'template_ready' : 'no_template'
  if (order.batches?.length) {
    const derived = deriveOrderStatusFromBatches(order.batches)
    if (derived === 'closed') return 'order_closed'
    if (derived === 'in_progress') return 'order_in_progress'
    return 'order_sent'
  }
  if (order.status === 'closed') return 'order_closed'
  if (order.status === 'in_progress') return 'order_in_progress'
  return 'order_sent'
}

function sanitizeQtyPrepared(value: unknown): number | null {
  if (value == null || value === '') return null
  const qty = Number(value)
  if (!Number.isFinite(qty) || qty < 0) return null
  return qty
}

export async function updateEventComandaBatch(params: {
  eventId: string
  warehouseId: string
  batchId?: string
  status?: EventComandaBatchStatus
  lines?: Array<{ articleCode: string; qtyPrepared: number | null }>
  userId?: string | null
  userName?: string | null
}): Promise<EventComandaOrderDoc> {
  const eventId = String(params.eventId || '').trim()
  const warehouseKey = warehouseDocId(params.warehouseId)
  const batchKey = String(params.batchId || warehouseKey).trim()
  if (!eventId) throw new Error('Event id required.')
  if (!warehouseKey) throw new Error('Magatzem no vàlid.')

  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) throw new Error('Comanda no trobada.')

  const batchIndex = order.batches.findIndex((entry) => {
    const entryKey = String(entry.batchId || entry.warehouseId).trim()
    return entryKey === batchKey
  })
  if (batchIndex < 0) throw new Error('Lot de magatzem no trobat.')

  const batch = { ...order.batches[batchIndex] }
  const previousStatus = normalizeEventComandaBatchStatus(batch.status)
  const now = Date.now()

  if (params.status) {
    batch.status = normalizeEventComandaBatchStatus(params.status)
    batch.statusUpdatedAt = now
    batch.statusUpdatedBy = params.userName || params.userId || null
    if (batch.status === 'ready' || batch.status === 'sent') {
      batch.lines = batch.lines.map((line) => ({
        ...line,
        qtyPrepared:
          line.qtyPrepared != null && Number.isFinite(Number(line.qtyPrepared))
            ? Number(line.qtyPrepared)
            : line.qtyRequested,
      }))
    }
  }

  if (Array.isArray(params.lines)) {
    const byCode = new Map(
      params.lines.map((line) => [
        String(line.articleCode || '').trim().toUpperCase(),
        sanitizeQtyPrepared(line.qtyPrepared),
      ])
    )
    batch.lines = batch.lines.map((line) => {
      const code = line.articleCode.toUpperCase()
      if (!byCode.has(code)) return line
      return {
        ...line,
        qtyPrepared: byCode.get(code) ?? null,
        modifiedAt: null,
        modifiedBy: null,
        qtyRequestedBefore: null,
      }
    })
  }

  const currentStatus = normalizeEventComandaBatchStatus(batch.status)
  if (
    currentStatus === 'pending' &&
    batch.lines.some(
      (line) => line.qtyPrepared != null && Number.isFinite(Number(line.qtyPrepared))
    )
  ) {
    batch.status = 'in_progress'
    batch.statusUpdatedAt = now
    batch.statusUpdatedBy = params.userName || params.userId || null
  }

  const batches = [...order.batches]
  batches[batchIndex] = batch
  const status = deriveOrderStatusFromBatches(batches)
  const warehouseIndex = computeOrderWarehouseIndex(batches)

  await db.collection(COL).doc(eventId).update({
    batches,
    status,
    ...warehouseIndex,
  })

  if (
    params.userId &&
    params.status &&
    (batch.status === 'ready' || batch.status === 'sent')
  ) {
    try {
      await dismissEventComandaWarehouseNotificationsForUser({
        userId: params.userId,
        eventId,
        warehouseId: batch.warehouseId,
        batchId: batchKey,
      })
      await reconcileEventComandaNotificationCount(params.userId)
    } catch (error) {
      console.error('[updateEventComandaBatch] dismiss notifications failed', error)
    }
  }

  if (
    batch.status === 'sent' &&
    previousStatus !== 'sent' &&
    params.status === 'sent'
  ) {
    const requesterUserId = String(
      order.sentByUserId || order.updatedByUserId || ''
    ).trim()
    if (requesterUserId && requesterUserId !== String(params.userId || '').trim()) {
      try {
        await notifyRequesterBatchSent({
          eventId,
          requesterUserId,
          warehouseId: batch.warehouseId,
          warehouseCode: batch.warehouseCode,
          warehouseName: batch.warehouseName,
          batchId: batchKey,
          lineCount: batch.lines.length,
          preparedByName: params.userName || params.userId || null,
          preparedByUserId: params.userId || null,
        })
      } catch (error) {
        console.error('[updateEventComandaBatch] requester notification failed', error)
      }
    }
  }

  const currentBatchStatus = normalizeEventComandaBatchStatus(batch.status)
  if (
    (currentBatchStatus === 'sent' || currentBatchStatus === 'cancelled') &&
    previousStatus !== currentBatchStatus
  ) {
    try {
      await archiveEventComandaBatchChatChannel(eventId, batch.warehouseId, batchKey)
    } catch (error) {
      console.error('[updateEventComandaBatch] archive comanda chat failed', error)
    }
  }

  return {
    ...order,
    batches,
    status,
    ...warehouseIndex,
  }
}

function resolveLineWarehouse(
  line: EventComandaOrderLine,
  articleWarehouseByCode: Map<string, string | null>,
  rules: Awaited<ReturnType<typeof listEventComandaWarehouseRules>>,
  warehouseById: Map<string, { code: string; name: string }>,
  options?: { preferCatalog?: boolean }
) {
  const fromLine = line.warehouseId ? warehouseDocId(line.warehouseId) : null
  if (fromLine && warehouseById.has(fromLine)) {
    const warehouse = warehouseById.get(fromLine)!
    return {
      warehouseId: fromLine,
      warehouseCode: String(line.warehouseCode || warehouse.code).trim() || warehouse.code,
      warehouseName: String(line.warehouseName || warehouse.name).trim() || warehouse.name,
    }
  }

  const code = line.articleCode.toUpperCase()

  const fromCatalog = articleWarehouseByCode.get(code)
  if (fromCatalog && warehouseById.has(fromCatalog)) {
    const warehouse = warehouseById.get(fromCatalog)!
    const resolved = {
      warehouseId: fromCatalog,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
    }
    if (options?.preferCatalog) return resolved
  }

  const fromRule = resolveWarehouseIdForArticleCode(code, rules)
  if (fromRule && warehouseById.has(fromRule)) {
    const warehouse = warehouseById.get(fromRule)!
    const resolved = {
      warehouseId: fromRule,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
    }
    if (options?.preferCatalog) return resolved
  }

  if (options?.preferCatalog) {
    return {
      warehouseId: UNASSIGNED_WAREHOUSE_ID,
      warehouseCode: '—',
      warehouseName: 'Sense magatzem',
    }
  }

  if (fromCatalog && warehouseById.has(fromCatalog)) {
    const warehouse = warehouseById.get(fromCatalog)!
    return {
      warehouseId: fromCatalog,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
    }
  }

  if (fromRule && warehouseById.has(fromRule)) {
    const warehouse = warehouseById.get(fromRule)!
    return {
      warehouseId: fromRule,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
    }
  }

  return {
    warehouseId: UNASSIGNED_WAREHOUSE_ID,
    warehouseCode: '—',
    warehouseName: 'Sense magatzem',
  }
}

function groupLinesByWarehouse(
  lines: EventComandaOrderLine[],
  articleWarehouseByCode: Map<string, string | null>,
  rules: Awaited<ReturnType<typeof listEventComandaWarehouseRules>>,
  warehouseById: Map<string, { code: string; name: string }>,
  options?: {
    forceWarehouse?: {
      warehouseId: string
      warehouseCode: string
      warehouseName: string
    }
    preferCatalogWarehouse?: boolean
  }
): EventComandaOrderBatch[] {
  const batches = new Map<string, EventComandaOrderBatch>()
  const forceWarehouse = options?.forceWarehouse
  const preferCatalogWarehouse = options?.preferCatalogWarehouse

  for (const line of lines) {
    const qty = Number(line.qtyRequested)
    if (!Number.isFinite(qty) || qty <= 0) continue

    const warehouse = forceWarehouse
      ? {
          warehouseId: forceWarehouse.warehouseId,
          warehouseCode: forceWarehouse.warehouseCode,
          warehouseName: forceWarehouse.warehouseName,
        }
      : resolveLineWarehouse(line, articleWarehouseByCode, rules, warehouseById, {
          preferCatalog: preferCatalogWarehouse,
        })
    const batchKey = warehouse.warehouseId

    const batch =
      batches.get(batchKey) ??
      ({
        warehouseId: warehouse.warehouseId,
        warehouseCode: warehouse.warehouseCode,
        warehouseName: warehouse.warehouseName,
        batchId: warehouse.warehouseId,
        kind: 'primary',
        lines: [],
        status: 'pending',
      } satisfies EventComandaOrderBatch)

    const nextLine: EventComandaOrderBatchLine = {
      articleCode: line.articleCode,
      articleName: line.articleName,
      family: line.family,
      qtyUnit: eventComandaQtyUnit(line.qtyUnit),
      qtyTemplate: line.qtyTemplate,
      qtyRequested: qty,
    }

    batch.lines.push(nextLine)
    batches.set(batchKey, batch)
  }

  return [...batches.values()]
    .map((batch) => ({
      ...batch,
      lines: batch.lines.sort((a, b) => a.articleCode.localeCompare(b.articleCode)),
    }))
    .sort((a, b) => {
      if (a.warehouseId === UNASSIGNED_WAREHOUSE_ID) return 1
      if (b.warehouseId === UNASSIGNED_WAREHOUSE_ID) return -1
      return a.warehouseCode.localeCompare(b.warehouseCode)
    })
}

export async function sendEventComandaOrder(params: {
  eventId: string
  lines: EventComandaOrderLine[]
  deliveryDate: string
  deliveryTimeSlot: string
  comments?: string | null
  userId?: string
  userName?: string
  eventTitle?: string | null
  notifyWarehouseMembers?: boolean
}) {
  const eventId = String(params.eventId || '').trim()
  if (!eventId) throw new Error('Event id required.')

  const deliveryDate = String(params.deliveryDate || '').trim()
  const deliveryTimeSlot = normalizeDeliveryTimeSlot(params.deliveryTimeSlot)
  if (!isValidDeliveryDate(deliveryDate)) {
    throw new Error('Cal indicar un dia d\'entrega vàlid.')
  }
  if (!deliveryTimeSlot) {
    throw new Error('Cal indicar la franja horària d\'entrega.')
  }

  await assertEventComandaDeliveryDateAndSlot({
    eventId,
    deliveryDate,
    deliveryTimeSlot,
  })

  const comments = String(params.comments || '').trim() || null

  const validLines = params.lines.filter(
    (line) => line.qtyRequested != null && Number(line.qtyRequested) > 0
  )
  if (validLines.length === 0) {
    throw new Error('Cal afegir almenys una línia amb quantitat.')
  }

  const existing = await getEventComandaOrder(eventId)
  if (existing && existing.status !== 'closed') {
    throw new Error('Ja hi ha una comanda activa per aquest esdeveniment.')
  }

  const batches = await buildOrderBatchesFromLines(validLines)
  if (batches.length === 0) {
    throw new Error('No s\'han pogut agrupar línies per magatzem.')
  }
  if (batches.some((batch) => batch.warehouseId === UNASSIGNED_WAREHOUSE_ID)) {
    throw new Error('Hi ha articles sense magatzem assignat. Selecciona un magatzem abans d\'enviar.')
  }

  const stampedBatches = batches.map((batch) => ({
    ...batch,
    createdByUserId: params.userId || null,
    createdByUserName: params.userName || null,
  }))

  const now = Date.now()
  const warehouseIndex = computeOrderWarehouseIndex(stampedBatches)
  const payload: EventComandaOrderDoc = {
    eventId,
    status: 'sent',
    sentAt: now,
    sentByUserId: params.userId || null,
    sentByUserName: params.userName || null,
    deliveryDate,
    deliveryTimeSlot,
    comments,
    batches: stampedBatches,
    lineCount: stampedBatches.reduce((sum, batch) => sum + batch.lines.length, 0),
    batchCount: stampedBatches.length,
    ...warehouseIndex,
  }

  await db.collection(COL).doc(eventId).set(payload, { merge: false })

  if (params.notifyWarehouseMembers !== false) {
    try {
      await notifyWarehouseMembersForOrderSent({
        eventId,
        eventTitle: params.eventTitle,
        sentByUserId: params.userId || null,
        sentByName: params.userName || null,
        batches: stampedBatches,
      })
    } catch (error) {
      console.error('[sendEventComandaOrder] warehouse notifications failed', error)
    }
  }

  try {
    await syncEventComandaChatChannels(eventId)
  } catch (error) {
    console.error('[sendEventComandaOrder] comanda chat sync failed', error)
  }

  return payload
}

async function buildOrderBatchesFromLines(
  lines: EventComandaOrderLine[],
  options?: {
    forceWarehouseId?: string
    forceWarehouseCode?: string | null
    forceWarehouseName?: string | null
    preferCatalogWarehouse?: boolean
  }
) {
  const codes = [...new Set(lines.map((line) => articleDocId(line.articleCode)).filter(Boolean))]
  const articleSnaps = codes.length
    ? await db.getAll(...codes.map((id) => db.collection(ARTICLES_COL).doc(id)))
    : []

  const articleWarehouseByCode = new Map<string, string | null>()
  for (const snap of articleSnaps) {
    if (!snap.exists) continue
    const data = snap.data() as { code?: string; warehouseId?: string }
    const code = String(data.code || snap.id).trim().toUpperCase()
    articleWarehouseByCode.set(
      code,
      data.warehouseId ? String(data.warehouseId).trim().toUpperCase() : null
    )
  }

  const [rules, warehouses] = await Promise.all([
    listEventComandaWarehouseRules(),
    listEventComandaWarehouses(true),
  ])
  const warehouseById = new Map(
    warehouses.map((warehouse) => [
      warehouse.id,
      { code: warehouse.code, name: warehouse.name },
    ])
  )

  const forcedId = warehouseDocId(options?.forceWarehouseId || '')
  const forceWarehouse = forcedId && warehouseById.has(forcedId)
    ? {
        warehouseId: forcedId,
        warehouseCode:
          String(options?.forceWarehouseCode || warehouseById.get(forcedId)!.code).trim() ||
          warehouseById.get(forcedId)!.code,
        warehouseName:
          String(options?.forceWarehouseName || warehouseById.get(forcedId)!.name).trim() ||
          warehouseById.get(forcedId)!.name,
      }
    : undefined

  return groupLinesByWarehouse(lines, articleWarehouseByCode, rules, warehouseById, {
    forceWarehouse,
    preferCatalogWarehouse: options?.preferCatalogWarehouse,
  })
}

export async function updateEventComandaOrder(params: {
  eventId: string
  lines: EventComandaOrderLine[]
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  comments?: string | null
  warehouseId?: string | null
  batchId?: string | null
  userId?: string
  userName?: string
  eventTitle?: string | null
  notifyWarehouseMembers?: boolean
}) {
  const eventId = String(params.eventId || '').trim()
  if (!eventId) throw new Error('Event id required.')

  const existing = await getEventComandaOrder(eventId)
  if (!existing?.sentAt) {
    throw new Error('No hi ha cap comanda per modificar.')
  }

  const deliveryDate = String(params.deliveryDate || existing.deliveryDate || '').trim()
  const deliveryTimeSlot = normalizeDeliveryTimeSlot(
    params.deliveryTimeSlot || existing.deliveryTimeSlot || ''
  )
  if (!isValidDeliveryDate(deliveryDate)) {
    throw new Error('Cal indicar un dia d\'entrega vàlid.')
  }
  if (!deliveryTimeSlot) {
    throw new Error('Cal indicar la franja horària d\'entrega.')
  }

  await assertEventComandaDeliveryDateAndSlot({
    eventId,
    deliveryDate,
    deliveryTimeSlot,
  })

  const comments =
    params.comments !== undefined
      ? String(params.comments || '').trim() || null
      : existing.comments ?? null

  const validLines = params.lines.filter(
    (line) => line.qtyRequested != null && Number(line.qtyRequested) > 0
  )
  if (validLines.length === 0) {
    throw new Error('Cal afegir almenys una línia amb quantitat.')
  }

  const scopeWarehouseId = warehouseDocId(params.warehouseId || '')
  const scopeBatchId = String(params.batchId || '').trim()
  if (!scopeWarehouseId) {
    throw new Error('Cal seleccionar un magatzem per modificar.')
  }

  const allResolvedBatches = await buildOrderBatchesFromLines(validLines, {
    preferCatalogWarehouse: true,
  })
  if (allResolvedBatches.length === 0) {
    throw new Error('No s\'han pogut agrupar línies per magatzem.')
  }
  if (allResolvedBatches.some((batch) => batch.warehouseId === UNASSIGNED_WAREHOUSE_ID)) {
    throw new Error('Hi ha articles sense magatzem assignat. Selecciona un magatzem abans d\'enviar.')
  }

  const warehouseLines = new Map<string, EventComandaOrderBatch>()
  for (const batch of allResolvedBatches) {
    warehouseLines.set(warehouseDocId(batch.warehouseId), batch)
  }

  const scopedBatch = warehouseLines.get(scopeWarehouseId)
  const otherBatches = [...warehouseLines.entries()].filter(([key]) => key !== scopeWarehouseId)

  if (!scopedBatch && otherBatches.length === 0) {
    throw new Error('Cal afegir almenys una línia amb quantitat.')
  }

  const updatedBy = params.userName || params.userId || null
  let batches = existing.batches
  let notifications: Awaited<ReturnType<typeof applyOrderUpdate>>['notifications'] = []

  if (scopedBatch) {
    const applied = applyOrderUpdate({
      nextBatches: [scopedBatch],
      previousBatches: batches,
      updatedBy,
      updatedByUserId: params.userId || null,
      targetBatchId: scopeBatchId || undefined,
    })
    batches = applied.batches
    notifications = applied.notifications
  }

  for (const [, otherBatch] of otherBatches) {
    const applied = applyAdditionalWarehouseLines({
      batches,
      warehouseId: otherBatch.warehouseId,
      warehouseCode: otherBatch.warehouseCode,
      warehouseName: otherBatch.warehouseName,
      incomingLines: otherBatch.lines,
      updatedBy,
      createdByUserId: params.userId || null,
    })
    batches = applied.batches
    notifications = [...notifications, ...applied.notifications]
  }

  const status = deriveOrderStatusFromBatches(batches)
  const now = Date.now()
  const warehouseIndex = computeOrderWarehouseIndex(batches)

  const payload: EventComandaOrderDoc = {
    ...existing,
    status,
    updatedAt: now,
    updatedByUserId: params.userId || null,
    updatedByUserName: params.userName || null,
    deliveryDate,
    deliveryTimeSlot,
    comments,
    batches,
    lineCount: batches.reduce((sum, batch) => sum + batch.lines.length, 0),
    batchCount: batches.length,
    ...warehouseIndex,
  }

  await db.collection(COL).doc(eventId).set(payload, { merge: false })

  if (params.notifyWarehouseMembers !== false && notifications.length) {
    try {
      await notifyWarehouseMembersForOrderUpdate({
        eventId,
        eventTitle: params.eventTitle,
        sentByUserId: params.userId || null,
        sentByName: params.userName || null,
        notifications,
      })
    } catch (error) {
      console.error('[updateEventComandaOrder] warehouse notifications failed', error)
    }
  }

  try {
    await syncEventComandaChatChannels(eventId)
  } catch (error) {
    console.error('[updateEventComandaOrder] comanda chat sync failed', error)
  }

  return payload
}

function resolveBatchCreatorUserId(
  batch: EventComandaOrderBatch,
  order: EventComandaOrderDoc
): string {
  const fromBatch = String(batch.createdByUserId || '').trim()
  if (fromBatch) return fromBatch
  if (batch.kind === 'revision') {
    return String(order.updatedByUserId || '').trim()
  }
  return String(order.sentByUserId || '').trim()
}

export async function deleteEventComandaBatch(params: {
  eventId: string
  warehouseId: string
  batchId: string
  userId: string
  userName?: string | null
}): Promise<EventComandaOrderDoc> {
  const eventId = String(params.eventId || '').trim()
  const warehouseKey = warehouseDocId(params.warehouseId)
  const batchKey = String(params.batchId || warehouseKey).trim()
  const userId = String(params.userId || '').trim()

  if (!eventId) throw new Error('Event id required.')
  if (!warehouseKey) throw new Error('Magatzem no vàlid.')
  if (!batchKey) throw new Error('Lot no vàlid.')
  if (!userId) throw new Error('Usuari no vàlid.')

  const order = await getEventComandaOrder(eventId)
  if (!order?.sentAt) throw new Error('Comanda no trobada.')

  const batchIndex = order.batches.findIndex((entry) => {
    const entryKey = String(entry.batchId || entry.warehouseId).trim()
    return entryKey === batchKey
  })
  if (batchIndex < 0) throw new Error('Lot de comanda no trobat.')

  const batch = order.batches[batchIndex]
  const status = normalizeEventComandaBatchStatus(batch.status)
  if (status !== 'pending') {
    throw new Error('Només es pot eliminar una comanda pendent.')
  }

  const creatorId = resolveBatchCreatorUserId(batch, order)
  if (!creatorId || creatorId !== userId) {
    throw new Error('Només el creador pot eliminar aquesta comanda.')
  }

  const now = Date.now()
  const updatedBy = params.userName || params.userId || null
  const batches = [...order.batches]
  batches[batchIndex] = {
    ...batch,
    status: 'cancelled',
    statusUpdatedAt: now,
    statusUpdatedBy: updatedBy,
  }

  const orderStatus = deriveOrderStatusFromBatches(batches)
  const warehouseIndex = computeOrderWarehouseIndex(batches)
  const payload: EventComandaOrderDoc = {
    ...order,
    status: orderStatus,
    updatedAt: now,
    updatedByUserId: userId,
    updatedByUserName: updatedBy,
    batches,
    lineCount: batches.reduce((sum, entry) => sum + entry.lines.length, 0),
    batchCount: batches.length,
    ...warehouseIndex,
  }

  await db.collection(COL).doc(eventId).set(payload, { merge: false })

  try {
    await archiveEventComandaBatchChatChannel(eventId, batch.warehouseId, batchKey)
  } catch (error) {
    console.error('[deleteEventComandaBatch] archive comanda chat failed', error)
  }

  try {
    await syncEventComandaChatChannels(eventId)
  } catch (error) {
    console.error('[deleteEventComandaBatch] comanda chat sync failed', error)
  }

  return payload
}

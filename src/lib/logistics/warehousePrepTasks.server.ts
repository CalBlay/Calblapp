import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { resolveEventDisplayName } from '@/lib/eventDisplayName'
import {
  normalizeEventComandaBatchStatus,
  PREPARER_VISIBLE_BATCH_STATUSES,
} from '@/lib/eventComanda/batchStatus'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import {
  deliverySlotLabel,
  formatOrderDeliverySummary,
  parseIsoDateKey,
} from '@/lib/eventComanda/deliverySlots'
import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import {
  canViewAllEventComandaWarehouses,
  listWarehouseIdsForUser,
} from '@/lib/eventComanda/warehouseMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'
import {
  deliveryDateRangeForPrepViewWindow,
  listWarehousePrepViewDaysForDelivery,
  warehousePrepSlotSortKey,
  warehousePrepStatusSortKey,
  type WarehousePrepViewRole,
} from '@/lib/logistics/warehousePrepVisibility'

const ORDERS_COL = EVENT_COMANDA_COLLECTIONS.orders
const STAGE_COL = 'stage_verd'

export type LogisticsWarehousePrepTask = {
  rowType: 'warehouse_comanda'
  id: string
  eventId: string
  batchId: string
  viewDay: string
  viewRole: WarehousePrepViewRole
  batchKind: 'primary' | 'revision'
  batchStatus: string
  eventTitle: string
  warehouseId: string
  warehouseName: string
  warehouseCode: string
  deliveryDate: string
  deliveryTimeSlot: string
  deliverySummary: string
  orderedAt: number
  lineCount: number
}

type OrderDoc = {
  sentAt?: number
  updatedAt?: number | null
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
  preparerVisibleWarehouseIds?: string[]
  batches?: EventComandaOrderBatch[]
}

async function resolveAllowedWarehouseIds(userId: string, role?: string | null) {
  if (canViewAllEventComandaWarehouses(role)) {
    return null
  }
  const assignedWarehouseIds = await listWarehouseIdsForUser(userId)
  if (!assignedWarehouseIds.length) return new Set<string>()
  return new Set(assignedWarehouseIds.map((id) => warehouseDocId(id)))
}

async function queryOrderEventIdsByWarehouseField(warehouseIds: string[]): Promise<string[]> {
  const ids = new Set<string>()
  const uniqueWarehouseIds = [...new Set(warehouseIds.map((id) => warehouseDocId(id)).filter(Boolean))]

  for (let offset = 0; offset < uniqueWarehouseIds.length; offset += 10) {
    const chunk = uniqueWarehouseIds.slice(offset, offset + 10)
    if (!chunk.length) continue

    const snap = await db
      .collection(ORDERS_COL)
      .where('preparerVisibleWarehouseIds', 'array-contains-any', chunk)
      .get()
    for (const doc of snap.docs) {
      ids.add(doc.id)
    }
  }

  return [...ids]
}

async function listActiveOrderEventIds(allowed: Set<string> | null): Promise<string[]> {
  if (allowed && allowed.size === 0) return []

  if (allowed === null) {
    const snap = await db.collection(ORDERS_COL).where('sentAt', '>', 0).select('sentAt').get()
    return snap.docs.map((doc) => doc.id)
  }

  const indexedIds = await queryOrderEventIdsByWarehouseField([...allowed])
  if (indexedIds.length) return indexedIds

  const snap = await db.collection(ORDERS_COL).where('sentAt', '>', 0).get()
  const eventIds: string[] = []

  for (const doc of snap.docs) {
    const data = doc.data() as OrderDoc
    const batches = Array.isArray(data.batches) ? data.batches : []
    const hasVisible = batches.some((batch) => {
      const warehouseId = warehouseDocId(batch.warehouseId || '')
      const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
      if (!lineCount || !allowed.has(warehouseId)) return false
      const status = normalizeEventComandaBatchStatus(batch.status)
      return PREPARER_VISIBLE_BATCH_STATUSES.has(status)
    })
    if (hasVisible) eventIds.push(doc.id)
  }

  return [...new Set(eventIds)]
}

function resolveOrderedAt(batch: EventComandaOrderBatch, order: OrderDoc) {
  if (batch.kind === 'revision') {
    return Number(batch.statusUpdatedAt) || Number(order.updatedAt) || Number(order.sentAt) || 0
  }
  return Number(order.sentAt) || 0
}

function batchIsVisibleToUser(
  batch: EventComandaOrderBatch,
  allowed: Set<string> | null
) {
  const warehouseId = warehouseDocId(batch.warehouseId || '')
  const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
  if (!lineCount) return false
  if (allowed !== null && !allowed.has(warehouseId)) return false
  const status = normalizeEventComandaBatchStatus(batch.status)
  return PREPARER_VISIBLE_BATCH_STATUSES.has(status)
}

export async function listWarehousePrepTasksForUser(params: {
  userId: string
  role?: string | null
  rangeStart: string
  rangeEnd: string
}): Promise<LogisticsWarehousePrepTask[]> {
  const rangeStart = parseIsoDateKey(params.rangeStart)
  const rangeEnd = parseIsoDateKey(params.rangeEnd)
  if (!rangeStart || !rangeEnd) return []

  const allowed = await resolveAllowedWarehouseIds(params.userId, params.role)
  if (allowed && allowed.size === 0) return []

  const { deliveryStart, deliveryEnd } = deliveryDateRangeForPrepViewWindow(rangeStart, rangeEnd)
  if (!deliveryStart || !deliveryEnd) return []

  const orderEventIds = await listActiveOrderEventIds(allowed)
  if (!orderEventIds.length) return []

  const tasks: LogisticsWarehousePrepTask[] = []

  for (let offset = 0; offset < orderEventIds.length; offset += 100) {
    const chunk = orderEventIds.slice(offset, offset + 100)
    const orderRefs = chunk.map((eventId) => db.collection(ORDERS_COL).doc(eventId))
    const stageRefs = chunk.map((eventId) => db.collection(STAGE_COL).doc(eventId))
    const [orderSnaps, stageSnaps] = await Promise.all([
      db.getAll(...orderRefs),
      db.getAll(...stageRefs),
    ])

    for (let index = 0; index < chunk.length; index += 1) {
      const eventId = chunk[index]
      const orderSnap = orderSnaps[index]
      if (!orderSnap.exists) continue

      const order = orderSnap.data() as OrderDoc
      if (!order.sentAt) continue

      const deliveryDate = parseIsoDateKey(order.deliveryDate || '')
      if (!deliveryDate || deliveryDate < deliveryStart || deliveryDate > deliveryEnd) continue

      const deliveryTimeSlot = String(order.deliveryTimeSlot || '').trim()
      const deliverySummary = formatOrderDeliverySummary({
        deliveryDate,
        deliveryTimeSlot,
      })

      const stageData = stageSnaps[index].exists
        ? (stageSnaps[index].data() as Record<string, unknown>)
        : null
      const eventTitle = stageData
        ? resolveEventDisplayName(stageData, eventId)
        : 'Esdeveniment amb comanda'

      const viewDays = listWarehousePrepViewDaysForDelivery({
        deliveryDate,
        rangeStart,
        rangeEnd,
      })
      if (!viewDays.length) continue

      const batches = Array.isArray(order.batches) ? order.batches : []
      for (const batch of batches) {
        if (!batchIsVisibleToUser(batch, allowed)) continue

        const batchId = String(batch.batchId || batch.warehouseId || '').trim()
        const warehouseId = warehouseDocId(batch.warehouseId || '')
        const status = normalizeEventComandaBatchStatus(batch.status)
        const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
        const orderedAt = resolveOrderedAt(batch, order)

        for (const { viewDay, viewRole } of viewDays) {
          tasks.push({
            rowType: 'warehouse_comanda',
            id: `${eventId}__${batchId}__${viewDay}`,
            eventId,
            batchId,
            viewDay,
            viewRole,
            batchKind: batch.kind === 'revision' ? 'revision' : 'primary',
            batchStatus: status,
            eventTitle,
            warehouseId,
            warehouseName: String(batch.warehouseName || '').trim(),
            warehouseCode: String(batch.warehouseCode || '').trim(),
            deliveryDate,
            deliveryTimeSlot,
            deliverySummary,
            orderedAt,
            lineCount,
          })
        }
      }
    }
  }

  return tasks.sort((a, b) => {
    if (a.viewDay !== b.viewDay) return a.viewDay.localeCompare(b.viewDay)
    if (a.viewRole !== b.viewRole) {
      const roleOrder: Record<WarehousePrepViewRole, number> = {
        delivery_today: 0,
        prep_tomorrow: 1,
        early_prep: 2,
      }
      return roleOrder[a.viewRole] - roleOrder[b.viewRole]
    }
    const statusDiff =
      warehousePrepStatusSortKey(
        normalizeEventComandaBatchStatus(a.batchStatus)
      ) -
      warehousePrepStatusSortKey(normalizeEventComandaBatchStatus(b.batchStatus))
    if (statusDiff !== 0) return statusDiff
    const slotDiff =
      warehousePrepSlotSortKey(a.deliveryTimeSlot) -
      warehousePrepSlotSortKey(b.deliveryTimeSlot)
    if (slotDiff !== 0) return slotDiff
    return a.eventTitle.localeCompare(b.eventTitle, 'ca', { sensitivity: 'base' })
  })
}

export function warehouseLabel(task: Pick<LogisticsWarehousePrepTask, 'warehouseName' | 'warehouseCode' | 'warehouseId'>) {
  const name = task.warehouseName?.trim()
  const code = task.warehouseCode?.trim()
  return name && code && name !== code ? `${name} · ${code}` : name || code || task.warehouseId || 'Magatzem'
}

export function warehouseOrderTypeLabel(kind: LogisticsWarehousePrepTask['batchKind']) {
  return kind === 'revision' ? 'Reposició' : 'Comanda'
}

export function formatOrderedAtLabel(orderedAt: number) {
  if (!orderedAt) return ''
  return new Date(orderedAt).toLocaleString('ca-ES', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function deliverySlotShortLabel(slot: string | undefined | null) {
  const label = deliverySlotLabel(slot)
  if (!label) return ''
  const match = label.match(/\(([^)]+)\)/)
  return match?.[1] || label
}

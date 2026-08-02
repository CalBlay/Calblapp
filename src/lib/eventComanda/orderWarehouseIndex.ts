import {
  normalizeEventComandaBatchStatus,
  PREPARER_HISTORY_BATCH_STATUSES,
  PREPARER_VISIBLE_BATCH_STATUSES,
} from '@/lib/eventComanda/batchStatus'
import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

export type OrderWarehouseIndex = {
  warehouseIds: string[]
  preparerVisibleWarehouseIds: string[]
  preparerHistoryWarehouseIds: string[]
}

export function computeOrderWarehouseIndex(
  batches: EventComandaOrderBatch[] | undefined | null
): OrderWarehouseIndex {
  const all = new Set<string>()
  const visible = new Set<string>()
  const history = new Set<string>()

  for (const batch of batches || []) {
    const warehouseId = warehouseDocId(batch.warehouseId || '')
    const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
    if (!warehouseId || !lineCount) continue

    const status = normalizeEventComandaBatchStatus(batch.status)
    if (status === 'cancelled') continue

    all.add(warehouseId)
    if (PREPARER_VISIBLE_BATCH_STATUSES.has(status)) visible.add(warehouseId)
    if (PREPARER_HISTORY_BATCH_STATUSES.has(status)) history.add(warehouseId)
  }

  return {
    warehouseIds: [...all],
    preparerVisibleWarehouseIds: [...visible],
    preparerHistoryWarehouseIds: [...history],
  }
}

export function orderWarehouseIndexIsMissing(data: {
  sentAt?: number | null
  preparerVisibleWarehouseIds?: string[] | null
}) {
  return Boolean(data.sentAt) && !Array.isArray(data.preparerVisibleWarehouseIds)
}

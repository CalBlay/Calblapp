import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import type { EventComandaOrderBatch, EventComandaOrderLine } from '@/lib/eventComanda/types'

function lineCode(line: { articleCode: string }) {
  return String(line.articleCode || '').trim().toUpperCase()
}

function batchSortWeight(batch: EventComandaOrderBatch) {
  if (batch.kind === 'revision') return 3
  if (batch.status === 'in_progress' || batch.status === 'issue') return 2
  if (batch.status === 'pending') return 1
  return 0
}

export function orderBatchesToLines(
  batches: EventComandaOrderBatch[] | undefined
): EventComandaOrderLine[] {
  if (!batches?.length) return []

  const byCode = new Map<string, EventComandaOrderLine>()
  const sortedBatches = [...batches].sort((a, b) => batchSortWeight(a) - batchSortWeight(b))

  for (const batch of sortedBatches) {
    if (batch.status === 'cancelled') continue
    for (const line of batch.lines) {
      if (line.qtyRequested <= 0 && batch.kind === 'revision') continue
      byCode.set(lineCode(line), {
        articleCode: line.articleCode,
        articleName: line.articleName,
        family: line.family,
        qtyUnit: eventComandaQtyUnit(line.qtyUnit),
        qtyTemplate: line.qtyTemplate,
        qtyRequested: line.qtyRequested,
        warehouseId: batch.warehouseId,
        warehouseCode: batch.warehouseCode,
        warehouseName: batch.warehouseName,
      })
    }
  }

  return [...byCode.values()].sort((a, b) =>
    a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' })
  )
}

export function batchToOrderLines(batch: EventComandaOrderBatch): EventComandaOrderLine[] {
  return batch.lines
    .filter((line) => line.qtyRequested > 0)
    .map((line) => ({
      articleCode: line.articleCode,
      articleName: line.articleName,
      family: line.family,
      qtyUnit: eventComandaQtyUnit(line.qtyUnit),
      qtyTemplate: line.qtyTemplate,
      qtyRequested: line.qtyRequested,
      warehouseId: batch.warehouseId,
      warehouseCode: batch.warehouseCode,
      warehouseName: batch.warehouseName,
    }))
    .sort((a, b) => a.articleCode.localeCompare(b.articleCode, 'ca', { sensitivity: 'base' }))
}

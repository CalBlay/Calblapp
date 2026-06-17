import type { WarehousePrepViewRole } from '@/lib/logistics/warehousePrepVisibility'

export type LogisticsEventPrepRow = {
  rowType: 'event'
  id: string
  EventCode: string
  NomEvent: string
  Ubicacio: string
  NumPax?: number
  DataInici: string
  DataVisual?: string
  HoraInici?: string
  PreparacioData?: string
  PreparacioHora?: string
}

export type LogisticsWarehousePrepRow = {
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

export type LogisticsPrepRow = LogisticsEventPrepRow | LogisticsWarehousePrepRow

export function isWarehousePrepRow(row: LogisticsPrepRow): row is LogisticsWarehousePrepRow {
  return row.rowType === 'warehouse_comanda'
}

export function isEventPrepRow(row: LogisticsPrepRow): row is LogisticsEventPrepRow {
  return row.rowType === 'event'
}

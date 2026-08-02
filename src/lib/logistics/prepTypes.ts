import type { WarehousePrepViewRole } from '@/lib/logistics/warehousePrepVisibility'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'

export type PreparationWarehouseCompletion = {
  userId: string
  userName: string
  at: string
}

export type PreparationWarehouseCompletionMap = Partial<
  Record<PreparationWarehouseCode, PreparationWarehouseCompletion>
>

export type LogisticsEventPrepRow = {
  rowType: 'event'
  id: string
  sourceCollection?: 'stage_verd' | 'logistics_preparation_services'
  planningMode?: 'event' | 'service'
  EventCode: string
  NomEvent: string
  Ubicacio: string
  NumPax?: number
  DataInici: string
  DataVisual?: string
  HoraInici?: string
  EventDate?: string
  EventTime?: string
  ServiceName?: string
  ServiceDate?: string
  ServiceTime?: string
  ParentEventId?: string
  PreparacioData?: string
  PreparacioHora?: string
  /** @deprecated Usa PreparacioMagatzems */
  PreparacioFeta?: boolean
  /** @deprecated Usa PreparacioMagatzems */
  PreparacioFetaPerUserId?: string
  /** @deprecated Usa PreparacioMagatzems */
  PreparacioFetaPerNom?: string
  /** @deprecated Usa PreparacioMagatzems */
  PreparacioFetaAt?: string
  PreparacioMagatzems?: PreparationWarehouseCompletionMap
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

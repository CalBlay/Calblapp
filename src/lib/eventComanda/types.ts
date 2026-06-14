export type EventComandaStatus =
  | 'no_template'
  | 'template_ready'
  | 'order_draft'
  | 'order_sent'
  | 'order_in_progress'
  | 'order_closed'

export type EventComandaLine = {
  articleCode: string
  articleName: string
  family: string
  qtyInitial: number
  qtyUnit?: string
}

export type EventComandaArticleOption = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit?: string
  qtyTemplate: number | null
  inTemplate: boolean
  warehouseId?: string | null
  warehouseCode?: string | null
  warehouseName?: string | null
}

export type EventComandaOrderLine = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit?: string
  qtyTemplate: number | null
  qtyRequested: number | null
  warehouseId?: string | null
  warehouseCode?: string | null
  warehouseName?: string | null
}

export type EventComandaBatchStatus =
  | 'pending'
  | 'in_progress'
  | 'ready'
  | 'sent'
  | 'issue'
  | 'cancelled'

export type EventComandaOrderBatchLine = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit?: string
  qtyTemplate: number | null
  qtyRequested: number
  /** Quantitat realment preparada al magatzem (null = encara no indicada). */
  qtyPrepared?: number | null
  /** Marcat pel sol·licitant mentre el magatzem prepara (es neteja en desar preparació). */
  modifiedAt?: number | null
  modifiedBy?: string | null
  qtyRequestedBefore?: number | null
}

export type EventComandaOrderBatchKind = 'primary' | 'revision'

export type EventComandaOrderBatch = {
  batchId?: string
  kind?: EventComandaOrderBatchKind
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  lines: EventComandaOrderBatchLine[]
  status: EventComandaBatchStatus
  statusUpdatedAt?: number | null
  statusUpdatedBy?: string | null
  createdByUserId?: string | null
  createdByUserName?: string | null
  opsChannelId?: string | null
  chatExtraMemberIds?: string[]
}

export type EventComandaOrderStatus = 'sent' | 'in_progress' | 'closed'

export type EventComandaSendPayload = {
  lines: EventComandaOrderLine[]
  deliveryDate?: string
  deliveryTimeSlot?: string
  comments?: string
  /** Modificació acotada a un lot de magatzem concret. */
  warehouseId?: string
  batchId?: string
}

export type EventComandaSummary = {
  eventId: string
  status: EventComandaStatus
  templateImportedAt?: string | null
  templateLineCount?: number
  templateFamilyCount?: number
  templateTotalQty?: number
  templateFileName?: string | null
  templateVersion?: number
  templateDateRangeLabel?: string | null
  linesByFamily?: Record<string, EventComandaLine[]>
  importWarnings?: string[]
  eventTitle?: string | null
  eventMeta?: string | null
  orderSentAt?: string | null
  orderSentBy?: string | null
  orderSentByUserId?: string | null
  orderUpdatedAt?: string | null
  orderUpdatedBy?: string | null
  orderUpdatedByUserId?: string | null
  orderDeliveryDate?: string | null
  orderDeliveryTimeSlot?: string | null
  orderComments?: string | null
  eventStartDate?: string | null
  eventEndDate?: string | null
  orderLineCount?: number
  orderBatchCount?: number
  orderBatches?: EventComandaOrderBatch[]
}

export const EVENT_COMANDA_STATUS_LABELS: Record<EventComandaStatus, string> = {
  no_template: 'Sense plantilla ERP',
  template_ready: 'Nova comanda',
  order_draft: 'Comanda en esborrany',
  order_sent: 'Enviada al magatzem',
  order_in_progress: 'En preparació',
  order_closed: 'Comanda tancada',
}

export type WarehouseComandaEventBatchChip = {
  batchId: string
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  status: EventComandaBatchStatus
  lineCount: number
}

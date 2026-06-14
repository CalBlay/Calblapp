export type EventComandaStatus =
  | 'no_template'
  | 'template_ready'
  | 'order_draft'
  | 'order_sent'
  | 'order_in_progress'
  | 'order_closed'
  | 'replenishment_pending'

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
}

export type EventComandaOrderLine = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit?: string
  qtyTemplate: number | null
  qtyRequested: number | null
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
  pendingReplenishmentCount?: number
}

export const EVENT_COMANDA_STATUS_LABELS: Record<EventComandaStatus, string> = {
  no_template: 'Sense plantilla ERP',
  template_ready: 'Nova comanda',
  order_draft: 'Comanda en esborrany',
  order_sent: 'Enviada al magatzem',
  order_in_progress: 'En preparació',
  order_closed: 'Comanda tancada',
  replenishment_pending: 'Reposició pendent',
}

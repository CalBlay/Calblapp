import { addDays, format, parseISO } from 'date-fns'
import {
  EVENT_COMANDA_DELIVERY_SLOT_WINDOWS,
  parseIsoDateKey,
  type EventComandaDeliveryTimeSlot,
} from '@/lib/eventComanda/deliverySlots'
import type { EventComandaBatchStatus } from '@/lib/eventComanda/types'

/** Dies abans de l'entrega que la comanda surt a la preparació (D-2, D-1, D). */
export const WAREHOUSE_PREP_LEAD_DAYS = 2

export type WarehousePrepViewRole = 'early_prep' | 'prep_tomorrow' | 'delivery_today'

export const WAREHOUSE_PREP_VIEW_ROLE_LABELS: Record<WarehousePrepViewRole, string> = {
  early_prep: 'Preparació anticipada',
  prep_tomorrow: 'Preparar per demà',
  delivery_today: 'Entrega avui',
}

const SLOT_SORT_ORDER: Record<EventComandaDeliveryTimeSlot, number> = {
  mati: 0,
  migdia: 1,
  tarda: 2,
  vespre: 3,
}

const STATUS_SORT_ORDER: Record<EventComandaBatchStatus, number> = {
  issue: 0,
  pending: 1,
  in_progress: 2,
  ready: 3,
  sent: 4,
  cancelled: 5,
}

function toIsoDate(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function addIsoDays(isoDate: string, days: number): string | null {
  const key = parseIsoDateKey(isoDate)
  if (!key) return null
  const parsed = parseISO(key)
  if (Number.isNaN(parsed.getTime())) return null
  return toIsoDate(addDays(parsed, days))
}

export function resolveWarehousePrepViewRole(
  viewDay: string,
  deliveryDate: string
): WarehousePrepViewRole | null {
  const view = parseIsoDateKey(viewDay)
  const delivery = parseIsoDateKey(deliveryDate)
  if (!view || !delivery) return null

  if (view === delivery) return 'delivery_today'

  const dayBefore = addIsoDays(delivery, -1)
  if (dayBefore && view === dayBefore) return 'prep_tomorrow'

  const twoDaysBefore = addIsoDays(delivery, -2)
  if (twoDaysBefore && view === twoDaysBefore) return 'early_prep'

  return null
}

export function listWarehousePrepViewDaysForDelivery(params: {
  deliveryDate: string
  rangeStart: string
  rangeEnd: string
}): Array<{ viewDay: string; viewRole: WarehousePrepViewRole }> {
  const delivery = parseIsoDateKey(params.deliveryDate)
  const rangeStart = parseIsoDateKey(params.rangeStart)
  const rangeEnd = parseIsoDateKey(params.rangeEnd)
  if (!delivery || !rangeStart || !rangeEnd) return []

  const rows: Array<{ viewDay: string; viewRole: WarehousePrepViewRole }> = []

  for (let offset = WAREHOUSE_PREP_LEAD_DAYS; offset >= 0; offset -= 1) {
    const viewDay = addIsoDays(delivery, -offset)
    if (!viewDay) continue
    if (viewDay < rangeStart || viewDay > rangeEnd) continue
    const viewRole = resolveWarehousePrepViewRole(viewDay, delivery)
    if (!viewRole) continue
    rows.push({ viewDay, viewRole })
  }

  return rows
}

/** Rang de dates d'entrega que poden generar files visibles dins [rangeStart, rangeEnd]. */
export function deliveryDateRangeForPrepViewWindow(rangeStart: string, rangeEnd: string) {
  const start = parseIsoDateKey(rangeStart)
  const end = parseIsoDateKey(rangeEnd)
  if (!start || !end) return { deliveryStart: '', deliveryEnd: '' }
  return {
    deliveryStart: start,
    deliveryEnd: addIsoDays(end, WAREHOUSE_PREP_LEAD_DAYS) || end,
  }
}

export function warehousePrepSlotSortKey(slot: string | undefined | null) {
  const raw = String(slot || '').trim().toLowerCase()
  if (raw in SLOT_SORT_ORDER) {
    return SLOT_SORT_ORDER[raw as EventComandaDeliveryTimeSlot]
  }
  return 99
}

export function warehousePrepStatusSortKey(status: EventComandaBatchStatus) {
  return STATUS_SORT_ORDER[status] ?? 99
}

export function warehousePrepSlotStartHour(slot: string | undefined | null) {
  const raw = String(slot || '').trim().toLowerCase()
  if (raw in EVENT_COMANDA_DELIVERY_SLOT_WINDOWS) {
    return EVENT_COMANDA_DELIVERY_SLOT_WINDOWS[raw as EventComandaDeliveryTimeSlot].startHour
  }
  return 99
}

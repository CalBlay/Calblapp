export type EventComandaDeliveryTimeSlot = 'mati' | 'migdia' | 'tarda' | 'vespre'

export const EVENT_COMANDA_DELIVERY_SLOTS: Array<{
  id: EventComandaDeliveryTimeSlot
  label: string
}> = [
  { id: 'mati', label: 'Matí (08:00–12:00)' },
  { id: 'migdia', label: 'Migdia (12:00–15:00)' },
  { id: 'tarda', label: 'Tarda (15:00–18:00)' },
  { id: 'vespre', label: 'Vespre (18:00–21:00)' },
]

export const EVENT_COMANDA_DELIVERY_SLOT_WINDOWS: Record<
  EventComandaDeliveryTimeSlot,
  { startHour: number; endHour: number }
> = {
  mati: { startHour: 8, endHour: 12 },
  migdia: { startHour: 12, endHour: 15 },
  tarda: { startHour: 15, endHour: 18 },
  vespre: { startHour: 18, endHour: 21 },
}

export type EventComandaDeliveryDateBounds = {
  minDate: string
  maxDate: string
}

const SLOT_LABELS = Object.fromEntries(
  EVENT_COMANDA_DELIVERY_SLOTS.map((slot) => [slot.id, slot.label])
) as Record<EventComandaDeliveryTimeSlot, string>

const SLOT_SET = new Set<string>(EVENT_COMANDA_DELIVERY_SLOTS.map((slot) => slot.id))

export function todayIsoDateLocal(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseIsoDateKey(value: string | undefined | null): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s]/)
  if (isoPrefix) return isoPrefix[1]

  const dayFirst = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (dayFirst) {
    const [, day, month, year] = dayFirst
    return `${year}-${month}-${day}`
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function resolveDeliveryDateBounds(
  eventEndDate?: string | null,
  now = new Date()
): EventComandaDeliveryDateBounds {
  const today = todayIsoDateLocal(now)
  const eventEnd = parseIsoDateKey(eventEndDate) || today
  const maxDate = eventEnd >= today ? eventEnd : today
  return { minDate: today, maxDate }
}

export function isDeliveryDateWithinBounds(
  date: string,
  bounds: EventComandaDeliveryDateBounds
) {
  const key = parseIsoDateKey(date)
  if (!key) return false
  return key >= bounds.minDate && key <= bounds.maxDate
}

function isDeliverySlotPastForToday(slot: EventComandaDeliveryTimeSlot, now: Date) {
  const window = EVENT_COMANDA_DELIVERY_SLOT_WINDOWS[slot]
  const slotEnd = new Date(now)
  slotEnd.setHours(window.endHour, 0, 0, 0)
  return now.getTime() >= slotEnd.getTime()
}

export function getAvailableDeliverySlotsForDate(
  deliveryDate: string,
  now = new Date()
): EventComandaDeliveryTimeSlot[] {
  const dateKey = parseIsoDateKey(deliveryDate)
  if (!dateKey) return []

  const today = todayIsoDateLocal(now)
  const filterPastSlots = dateKey === today

  return EVENT_COMANDA_DELIVERY_SLOTS.map((slot) => slot.id).filter((slotId) => {
    if (!filterPastSlots) return true
    return !isDeliverySlotPastForToday(slotId, now)
  })
}

export function isDeliverySlotAvailableForDate(
  deliveryDate: string,
  slot: string | undefined | null,
  now = new Date()
) {
  const normalized = normalizeDeliveryTimeSlot(slot)
  if (!normalized) return false
  return getAvailableDeliverySlotsForDate(deliveryDate, now).includes(normalized)
}

export function validateDeliveryDateAndSlot(params: {
  deliveryDate: string
  deliveryTimeSlot: string
  bounds: EventComandaDeliveryDateBounds
  now?: Date
}): string | null {
  const now = params.now ?? new Date()
  const deliveryDate = String(params.deliveryDate || '').trim()
  const slot = normalizeDeliveryTimeSlot(params.deliveryTimeSlot)

  if (!isValidDeliveryDate(deliveryDate)) {
    return 'Cal indicar un dia d\'entrega vàlid.'
  }
  if (!isDeliveryDateWithinBounds(deliveryDate, params.bounds)) {
    const minLabel = formatDeliveryDateLabel(params.bounds.minDate)
    const maxLabel = formatDeliveryDateLabel(params.bounds.maxDate)
    return `La data d'entrega ha d'estar entre ${minLabel} i ${maxLabel}.`
  }
  if (!slot) {
    return 'Cal indicar la franja horària d\'entrega.'
  }
  if (!isDeliverySlotAvailableForDate(deliveryDate, slot, now)) {
    return 'La franja horària seleccionada ja no està disponible per al dia escollit.'
  }
  return null
}

export function normalizeDeliveryTimeSlot(
  value: string | undefined | null
): EventComandaDeliveryTimeSlot | null {
  const raw = String(value || '').trim().toLowerCase()
  return SLOT_SET.has(raw) ? (raw as EventComandaDeliveryTimeSlot) : null
}

export function deliverySlotLabel(slot: string | undefined | null) {
  const normalized = normalizeDeliveryTimeSlot(slot)
  return normalized ? SLOT_LABELS[normalized] : ''
}

export function formatDeliveryDateLabel(isoDate: string | undefined | null) {
  const raw = String(isoDate || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const [year, month, day] = raw.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleDateString('ca-ES', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

export function formatOrderDeliverySummary(params: {
  deliveryDate?: string | null
  deliveryTimeSlot?: string | null
}) {
  const dateLabel = formatDeliveryDateLabel(params.deliveryDate)
  const slotLabel = deliverySlotLabel(params.deliveryTimeSlot)
  if (dateLabel && slotLabel) return `${dateLabel} · ${slotLabel}`
  return dateLabel || slotLabel || ''
}

export function isValidDeliveryDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

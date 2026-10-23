type EventWithLn = {
  lnKey?: string
}

export const EVENT_LN_KEYS = [
  'empresa',
  'casaments',
  'foodlovers',
  'grups restaurants',
  'agenda',
  'altres',
] as const

export type EventLnKey = (typeof EVENT_LN_KEYS)[number]

export const DEFAULT_VISIBLE_EVENT_LN_KEYS: EventLnKey[] = EVENT_LN_KEYS.filter(
  (key) => key !== 'grups restaurants'
)

export function defaultEventLnSelection(departmentLn?: EventLnKey): EventLnKey[] {
  return departmentLn ? [departmentLn] : [...DEFAULT_VISIBLE_EVENT_LN_KEYS]
}

const normalizeLnText = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

export function normalizeEventLnKey(value?: string | null): EventLnKey {
  const normalized = normalizeLnText(value)
  if (
    normalized === 'grups restaurants' ||
    normalized === 'grup restaurants' ||
    normalized === 'restaurants'
  ) {
    return 'grups restaurants'
  }
  return EVENT_LN_KEYS.includes(normalized as EventLnKey)
    ? (normalized as EventLnKey)
    : 'altres'
}

export function formatEventLnLabel(key: EventLnKey): string {
  if (key === 'grups restaurants') return 'Grups Restaurants'
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function toggleEventLnSelection<T extends string>(selected: T[], value: T): T[] {
  return selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value]
}

export function filterEventsByLns<T extends EventWithLn>(
  events: T[],
  selected: string[] = []
): T[] {
  if (selected.length === 0) return events
  const selectedSet = new Set(selected)
  return events.filter((event) => Boolean(event.lnKey && selectedSet.has(event.lnKey)))
}

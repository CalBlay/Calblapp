/**
 * Dates for incident-action Outlook all-day events.
 * Graph stores Europe/Madrid calendar days, so ISO timestamps must not use
 * the server's local timezone.
 */

export function isoToBarcelonaCalendarDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const normalized = iso.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || ''
  return `${read('year')}-${read('month')}-${read('day')}`
}

/**
 * All-day Graph events cannot start after they end. Invalid or future-of-deadline
 * start dates fall back to the deadline day (single-day event).
 */
export function incidentActionCalendarStartDate(
  requestedStartDate: string | null | undefined,
  deadline: string
): string {
  const requested = String(requestedStartDate || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= deadline
    ? requested
    : deadline
}

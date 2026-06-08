export const parseDateValue = (value?: string | number | null): Date | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? `${value.trim()}T00:00:00`
      : value.trim()
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date
  }

  return null
}

export const formatDateOnly = (value?: string | number | null, fallback = '-') => {
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  return new Intl.DateTimeFormat('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

/** Mateix format que la llista de Torns: dd/mm/aa (p. ex. 09/06/26). */
export const formatTornsDayDate = (value?: string | number | null, fallback = '') => {
  const raw = String(value ?? '').trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`
  }
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  const dd = String(parsed.getDate()).padStart(2, '0')
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const yy = String(parsed.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

export const formatDayMonthValue = (value?: string | number | null, fallback = '-') => {
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  return new Intl.DateTimeFormat('ca-ES', {
    day: '2-digit',
    month: '2-digit',
  }).format(parsed)
}

export const formatTimeValue = (value?: string | number | null, fallback = '-') => {
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  return new Intl.DateTimeFormat('ca-ES', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

export const formatDateTimeValue = (value?: string | number | null, fallback = '-') => {
  const parsed = parseDateValue(value)
  if (!parsed) return fallback
  return new Intl.DateTimeFormat('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

const ISO_DATE_IN_TEXT = /\d{4}-\d{2}-\d{2}/g
const TRAILING_FORMATTED_DATES = /(?:\s+\d{2}\/\d{2}\/\d{2,4})+$/
const TRAILING_ISO_DATE = /\s+\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/

/** Treu dates al final del text (ISO o dd/mm/aa) per evitar duplicats. */
function stripTrailingNotificationDate(text: string): string {
  return text.replace(TRAILING_FORMATTED_DATES, '').replace(TRAILING_ISO_DATE, '').trim()
}

/** Etiqueta de notificació de torn: nom d'esdeveniment + data dd/mm/aa. */
export function formatTornNotificationLabel(eventName: string, eventDate?: string | null) {
  const name = stripTrailingNotificationDate(String(eventName || '').trim()) || 'Nou esdeveniment'
  const date = eventDate ? formatTornsDayDate(eventDate) : ''
  return date ? `${name} ${date}` : name
}

/** Normalitza bodies antics (ISO) o reutilitza `eventDate` per mostrar format consistent. Idempotent. */
export function formatTornNotificationBody(body?: string | null, eventDate?: string | null) {
  const raw = String(body || '').trim()
  if (!raw && !eventDate) return ''

  if (eventDate) {
    const name = stripTrailingNotificationDate(raw) || 'Nou esdeveniment'
    return formatTornNotificationLabel(name, eventDate)
  }

  return raw.replace(ISO_DATE_IN_TEXT, (iso) => formatTornsDayDate(iso) || iso)
}

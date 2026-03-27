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

export type CalendarFileLike = {
  key: string
  url: string
  name?: string
}

export function formatCalendarFileKeyLabel(key: string) {
  const raw = String(key || '').trim()
  const match = raw.match(/^(?:zohofile|file)(\d+)$/i)
  if (match) return `Document ${match[1]}`
  return raw || 'Document'
}

export function displayCalendarFileName(file: CalendarFileLike) {
  const stored = String(file.name || '').trim()
  if (stored) return stored
  return formatCalendarFileKeyLabel(file.key)
}

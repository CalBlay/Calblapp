const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function listEventDays(startValue: unknown, endValue: unknown): string[] {
  const start = String(startValue ?? '').trim()
  const rawEnd = String(endValue ?? '').trim()
  const end = ISO_DATE_PATTERN.test(rawEnd) ? rawEnd : start

  if (!ISO_DATE_PATTERN.test(start) || !ISO_DATE_PATTERN.test(end) || end < start) {
    return []
  }

  const current = new Date(`${start}T12:00:00.000Z`)
  const last = new Date(`${end}T12:00:00.000Z`)
  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime())) return []

  const days: string[] = []
  while (current <= last) {
    days.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return days
}

export function buildPreparationDayId(parentEventId: string, day: string) {
  return `prepday_${parentEventId}_${day}`.replaceAll('/', '_')
}

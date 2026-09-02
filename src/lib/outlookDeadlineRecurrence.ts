export function dateKeyInMadrid(value: Date): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(value)
}

export function buildDailyDeadlineRecurrence(deadline: string, now: Date = new Date()) {
  const todayKey = dateKeyInMadrid(now)
  if (!deadline || deadline <= todayKey) return null

  return {
    pattern: {
      type: 'daily',
      interval: 1,
    },
    range: {
      type: 'endDate',
      startDate: todayKey,
      endDate: deadline,
      recurrenceTimeZone: 'Europe/Madrid',
    },
  }
}

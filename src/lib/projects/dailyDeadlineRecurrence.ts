export type DailyDeadlineRecurrence = {
  pattern: {
    type: 'daily'
    interval: number
  }
  range: {
    type: 'endDate'
    startDate: string
    endDate: string
    recurrenceTimeZone: 'Europe/Madrid'
  }
}

/**
 * Daily all-day reminder until `deadline`. Returns null when the deadline is
 * today or in the past so Graph creates/keeps a single instance instead of a series.
 */
export function buildDailyDeadlineRecurrence(
  deadline: string,
  todayKey: string
): DailyDeadlineRecurrence | null {
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

/**
 * Graph PATCH omits unchanged properties. If we drop `recurrence` when converting
 * a series to a single instance, Outlook keeps the original range (busy every day
 * until the old deadline). Existing events must send `recurrence: null`.
 */
export function deadlineCalendarRecurrenceBody(
  deadline: string,
  options: { eventId?: string | null; todayKey: string }
): { recurrence: DailyDeadlineRecurrence | null } | Record<string, never> {
  const recurrence = buildDailyDeadlineRecurrence(deadline, options.todayKey)
  if (recurrence) return { recurrence }
  if (String(options.eventId || '').trim()) return { recurrence: null }
  return {}
}

export function deadlineCalendarStartDate(deadline: string, todayKey: string): string {
  return buildDailyDeadlineRecurrence(deadline, todayKey)?.range.startDate || deadline
}

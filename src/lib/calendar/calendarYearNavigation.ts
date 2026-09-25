import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

type CalendarYearViewMode = 'month' | 'week' | 'range'

export function calendarPeriodForYear({
  start,
  mode,
  year,
  rangeMonths,
}: {
  start: string
  mode: CalendarYearViewMode
  year: number
  rangeMonths: number
}): { start: string; end: string } {
  const anchor = parseISO(start)
  const month = anchor.getMonth()

  if (mode === 'month') {
    const nextAnchor = new Date(year, month, 1)
    return {
      start: format(startOfMonth(nextAnchor), 'yyyy-MM-dd'),
      end: format(endOfMonth(nextAnchor), 'yyyy-MM-dd'),
    }
  }

  if (mode === 'week') {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const nextAnchor = new Date(
      year,
      month,
      Math.min(anchor.getDate(), lastDayOfMonth)
    )
    return {
      start: format(startOfWeek(nextAnchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      end: format(endOfWeek(nextAnchor, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    }
  }

  const rangeStart = startOfMonth(new Date(year, month, 1))
  const rangeEnd = endOfMonth(addMonths(rangeStart, Math.max(1, rangeMonths) - 1))
  return {
    start: format(rangeStart, 'yyyy-MM-dd'),
    end: format(rangeEnd, 'yyyy-MM-dd'),
  }
}

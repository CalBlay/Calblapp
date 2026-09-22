export type TachographReviewState = 'missing' | 'ok' | 'upcoming' | 'overdue'

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

export function normalizeTachographReviewDates(values?: unknown[]): string[] {
  if (!Array.isArray(values)) return []

  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => {
          if (!DATE_KEY_PATTERN.test(value)) return false
          const [year, month, day] = value.split('-').map(Number)
          const date = new Date(`${value}T00:00:00`)
          return (
            !Number.isNaN(date.getTime()) &&
            date.getFullYear() === year &&
            date.getMonth() + 1 === month &&
            date.getDate() === day
          )
        })
    )
  ).sort((a, b) => a.localeCompare(b))
}

export function addYearsToDateKey(value: string, years: number): string {
  if (!DATE_KEY_PATTERN.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const targetYear = year + years
  const lastDayOfTargetMonth = new Date(targetYear, month, 0).getDate()
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(
    Math.min(day, lastDayOfTargetMonth)
  ).padStart(2, '0')}`
}

export function getTachographReviewInfo(values: unknown[], today = new Date()) {
  const reviewDates = normalizeTachographReviewDates(values)
  const latestReviewDate = reviewDates.at(-1) || null
  const nextReviewDate = latestReviewDate ? addYearsToDateKey(latestReviewDate, 2) : null

  if (!latestReviewDate || !nextReviewDate) {
    return {
      reviewDates,
      latestReviewDate,
      nextReviewDate,
      state: 'missing' as TachographReviewState,
      daysRemaining: null,
    }
  }

  const currentDay = new Date(today)
  currentDay.setHours(0, 0, 0, 0)
  const dueDate = new Date(`${nextReviewDate}T00:00:00`)
  const daysRemaining = Math.round((dueDate.getTime() - currentDay.getTime()) / DAY_MS)
  const state: TachographReviewState =
    daysRemaining < 0 ? 'overdue' : daysRemaining <= 30 ? 'upcoming' : 'ok'

  return {
    reviewDates,
    latestReviewDate,
    nextReviewDate,
    state,
    daysRemaining,
  }
}

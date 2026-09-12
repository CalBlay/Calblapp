export type ManualServiceRecurrence =
  | {
      kind: 'weekly'
      endDate: string
      /** Dies ISO: dilluns = 1, diumenge = 7. */
      weekdays: number[]
    }
  | {
      kind: 'interval'
      endDate: string
      intervalDays: number
    }

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDay(value: string): Date | null {
  if (!ISO_DAY_RE.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function buildManualRecurrenceDates(
  startDate: string,
  recurrence: ManualServiceRecurrence,
  maxOccurrences = 200
): string[] {
  const start = parseIsoDay(startDate)
  const end = parseIsoDay(recurrence.endDate)
  if (!start || !end) throw new Error('El període de programació no és vàlid')
  if (end < start) throw new Error('La data final ha de ser posterior a la inicial')

  const daysInRange = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (daysInRange > 366) {
    throw new Error('La programació no pot superar un any')
  }

  const dates: string[] = []
  if (recurrence.kind === 'interval') {
    const intervalDays = Math.floor(Number(recurrence.intervalDays))
    if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 31) {
      throw new Error("L'interval ha de ser d'entre 1 i 31 dies")
    }
    for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, intervalDays)) {
      dates.push(formatIsoDay(cursor))
      if (dates.length > maxOccurrences) throw new Error('La programació genera massa serveis')
    }
  } else {
    const weekdays = new Set(
      recurrence.weekdays
        .map((day) => Math.floor(Number(day)))
        .filter((day) => day >= 1 && day <= 7)
    )
    if (weekdays.size === 0) throw new Error('Selecciona almenys un dia de la setmana')

    for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
      const isoWeekday = cursor.getUTCDay() || 7
      if (weekdays.has(isoWeekday)) dates.push(formatIsoDay(cursor))
      if (dates.length > maxOccurrences) throw new Error('La programació genera massa serveis')
    }
  }

  if (dates.length === 0) throw new Error('La programació no genera cap servei en aquest període')
  return dates
}

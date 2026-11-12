export type PersonnelWorkloadTone = 'green' | 'orange' | 'red'

export type PersonnelWorkloadSummary = {
  maxHoursWeek: number
  monthlyLimitHours: number
  weeklyHours: number
  candidateHours: number
  projectedWeeklyHours: number
  monthlyActualHours: number
  weeklyTone: PersonnelWorkloadTone
  monthlyExceeded: boolean
}

export type WorkloadLine = {
  id?: string
  name?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  endTimeReal?: string
  noShow?: boolean
}

export type WorkloadPeriod = {
  startDate: string
  endDate: string
}

export type WorkloadTotals = {
  weeklyHoursByPerson: Map<string, number>
  monthlyActualHoursByPerson: Map<string, number>
}

const DAY_MS = 86_400_000

const norm = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const personKeys = (line: Pick<WorkloadLine, 'id' | 'name'>) => {
  const keys: string[] = []
  const id = norm(line.id)
  const name = norm(line.name)
  if (id) keys.push(`id:${id}`)
  if (name) keys.push(`name:${name}`)
  return keys
}

const parseLocalDateTime = (date?: string, time?: string) => {
  const day = String(date || '').slice(0, 10)
  const clock = String(time || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(clock)) return null
  const value = new Date(`${day}T${clock}:00`)
  return Number.isNaN(value.getTime()) ? null : value
}

const periodBounds = (period: WorkloadPeriod) => {
  const start = parseLocalDateTime(period.startDate, '00:00')
  const endDay = parseLocalDateTime(period.endDate, '00:00')
  if (!start || !endDay) return null
  return { start, end: new Date(endDay.getTime() + DAY_MS) }
}

function lineRange(line: WorkloadLine, useRealEnd: boolean) {
  const start = parseLocalDateTime(line.startDate, line.startTime)
  const endTime = useRealEnd ? line.endTimeReal : line.endTime
  if (!start || !endTime) return null
  // El `endDate` heretat de la capcalera pot ser el final d'un esdeveniment
  // de diversos dies, no el final del torn d'aquesta persona. Les hores de
  // personal es calculen per linia: mateix dia, o dia seguent si creua mitjanit.
  let end = parseLocalDateTime(line.startDate, endTime)
  if (!end) return null
  if (end <= start) end = new Date(end.getTime() + DAY_MS)
  return { start, end }
}

function overlapHours(
  line: WorkloadLine,
  period: WorkloadPeriod,
  useRealEnd: boolean
) {
  const overlap = overlapRange(line, period, useRealEnd)
  return overlap ? (overlap.end - overlap.start) / 3_600_000 : 0
}

function overlapRange(
  line: WorkloadLine,
  period: WorkloadPeriod,
  useRealEnd: boolean
) {
  if (line.noShow) return null
  const range = lineRange(line, useRealEnd)
  const bounds = periodBounds(period)
  if (!range || !bounds) return null
  const start = Math.max(range.start.getTime(), bounds.start.getTime())
  const end = Math.min(range.end.getTime(), bounds.end.getTime())
  return end > start ? { start, end } : null
}

type MillisecondRange = { start: number; end: number }

const addRange = (
  map: Map<string, MillisecondRange[]>,
  keys: string[],
  range: MillisecondRange | null
) => {
  if (!range) return
  keys.forEach((key) => {
    const ranges = map.get(key) || []
    ranges.push(range)
    map.set(key, ranges)
  })
}

const mergedHours = (ranges: MillisecondRange[]) => {
  if (ranges.length === 0) return 0
  const ordered = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  let totalMs = 0
  let currentStart = ordered[0].start
  let currentEnd = ordered[0].end
  for (let index = 1; index < ordered.length; index += 1) {
    const range = ordered[index]
    if (range.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, range.end)
      continue
    }
    totalMs += currentEnd - currentStart
    currentStart = range.start
    currentEnd = range.end
  }
  totalMs += currentEnd - currentStart
  return totalMs / 3_600_000
}

const collapseRanges = (rangesByPerson: Map<string, MillisecondRange[]>) => {
  const hoursByPerson = new Map<string, number>()
  rangesByPerson.forEach((ranges, key) => hoursByPerson.set(key, mergedHours(ranges)))
  return hoursByPerson
}

/**
 * Setmana: hores reals si el servei esta tancat, planificades si encara no ho esta.
 * Mes: nomes hores reals procedents del tancament operatiu.
 */
export function aggregatePersonnelWorkload(
  lines: WorkloadLine[],
  weeklyPeriod: WorkloadPeriod,
  monthlyPeriod: WorkloadPeriod
): WorkloadTotals {
  const weeklyRangesByPerson = new Map<string, MillisecondRange[]>()
  const monthlyRangesByPerson = new Map<string, MillisecondRange[]>()
  const idByName = new Map<string, string>()

  lines.forEach((line) => {
    const id = norm(line.id)
    const name = norm(line.name)
    if (id && name) idByName.set(name, id)
  })

  lines.forEach((line) => {
    const keys = personKeys(line)
    const name = norm(line.name)
    const knownId = name ? idByName.get(name) : undefined
    if (knownId && !keys.includes(`id:${knownId}`)) keys.push(`id:${knownId}`)
    if (keys.length === 0) return
    const hasRealEnd = /^\d{2}:\d{2}$/.test(String(line.endTimeReal || '').trim())
    addRange(
      weeklyRangesByPerson,
      keys,
      overlapRange(line, weeklyPeriod, hasRealEnd)
    )
    if (hasRealEnd) {
      addRange(
        monthlyRangesByPerson,
        keys,
        overlapRange(line, monthlyPeriod, true)
      )
    }
  })

  return {
    weeklyHoursByPerson: collapseRanges(weeklyRangesByPerson),
    monthlyActualHoursByPerson: collapseRanges(monthlyRangesByPerson),
  }
}

export function hoursForPerson(
  map: Map<string, number>,
  person: { id?: string; name?: string }
) {
  const idKey = norm(person.id) ? `id:${norm(person.id)}` : ''
  if (idKey && map.has(idKey)) return map.get(idKey) || 0
  const nameKey = norm(person.name) ? `name:${norm(person.name)}` : ''
  return nameKey ? map.get(nameKey) || 0 : 0
}

export function candidateHoursInPeriod(
  line: WorkloadLine,
  period: WorkloadPeriod
) {
  return overlapHours(line, period, false)
}

export function buildPersonnelWorkloadSummary(input: {
  maxHoursWeek?: number
  weeklyHours: number
  candidateHours: number
  monthlyActualHours: number
}): PersonnelWorkloadSummary {
  const maxHoursWeek =
    Number.isFinite(input.maxHoursWeek) && Number(input.maxHoursWeek) >= 0
      ? Number(input.maxHoursWeek)
      : 40
  const weeklyHours = Math.max(0, input.weeklyHours)
  const candidateHours = Math.max(0, input.candidateHours)
  const projectedWeeklyHours = weeklyHours + candidateHours
  const monthlyLimitHours = maxHoursWeek * 4.3
  const weeklyTone: PersonnelWorkloadTone =
    weeklyHours >= maxHoursWeek
      ? 'red'
      : projectedWeeklyHours > maxHoursWeek
        ? 'orange'
        : 'green'

  return {
    maxHoursWeek: Number(maxHoursWeek.toFixed(2)),
    monthlyLimitHours: Number(monthlyLimitHours.toFixed(2)),
    weeklyHours: Number(weeklyHours.toFixed(2)),
    candidateHours: Number(candidateHours.toFixed(2)),
    projectedWeeklyHours: Number(projectedWeeklyHours.toFixed(2)),
    monthlyActualHours: Number(Math.max(0, input.monthlyActualHours).toFixed(2)),
    weeklyTone,
    monthlyExceeded: input.monthlyActualHours > monthlyLimitHours,
  }
}

export function workloadPeriodsForDate(dateYmd: string) {
  const day = parseLocalDateTime(dateYmd, '12:00')
  if (!day) return null
  const weekday = day.getDay() || 7
  const weekStart = new Date(day)
  weekStart.setDate(day.getDate() - weekday + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(day.getFullYear(), day.getMonth(), 1, 12)
  const monthEnd = new Date(day.getFullYear(), day.getMonth() + 1, 0, 12)
  const toYmd = (value: Date) => {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const date = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  }
  return {
    week: { startDate: toYmd(weekStart), endDate: toYmd(weekEnd) },
    month: { startDate: toYmd(monthStart), endDate: toYmd(monthEnd) },
  }
}

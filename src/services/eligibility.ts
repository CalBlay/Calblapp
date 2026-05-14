// src/services/eligibility.ts
export interface AssignmentPerson {
  name: string
}

export interface BusyAssignment {
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  responsable?: AssignmentPerson
  responsableName?: string | null
  responsables?: AssignmentPerson[]
  conductors?: AssignmentPerson[]
  treballadors?: AssignmentPerson[]
  groups?: Array<{
    responsibleName?: string | null
    responsibleId?: string | null
  }>
}

export type EligibilityCtx = {
  busyAssignments: BusyAssignment[]
  restHours: number
  allowMultipleEventsSameDay: boolean
  maxFirstEventDurationHours?: number
}

export type RangeEligibilityCtx = {
  restHours: number
  allowMultipleEventsSameDay: boolean
  maxFirstEventDurationHours?: number
}

export type EligibilityReason = 'overlap' | 'rest_violation' | 'same_day_not_allowed'

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s: string) => unaccent(s).toLowerCase().trim()

const toISO = (d: string, t?: string) => `${d}T${(t || '00:00')}:00`
const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 36e5
const normalizeRange = (start: Date, end: Date) =>
  end <= start ? { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) } : { start, end }
const durationHours = (start: Date, end: Date) => {
  const range = normalizeRange(start, end)
  return (range.end.getTime() - range.start.getTime()) / 36e5
}

function shouldRequireMinRest(params: {
  reqStart: Date
  reqEnd: Date
  reqStartDate: string
  busyStart: Date
  busyEnd: Date
  busyStartDate: string
  ctx: RangeEligibilityCtx
}) {
  const { reqStart, reqEnd, reqStartDate, busyStart, busyEnd, busyStartDate, ctx } = params
  if (!ctx.allowMultipleEventsSameDay) return true
  if (!reqStartDate || !busyStartDate || reqStartDate !== busyStartDate) return true

  const threshold = Number(ctx.maxFirstEventDurationHours ?? 0)
  if (!Number.isFinite(threshold) || threshold <= 0) return true

  const req = normalizeRange(reqStart, reqEnd)
  const busy = normalizeRange(busyStart, busyEnd)
  const firstService =
    req.start.getTime() <= busy.start.getTime()
      ? { start: req.start, end: req.end }
      : { start: busy.start, end: busy.end }

  return durationHours(firstService.start, firstService.end) > threshold
}

export function evaluateRangeEligibility(params: {
  reqStart: Date
  reqEnd: Date
  reqStartDate: string
  busyStart: Date
  busyEnd: Date
  busyStartDate: string
  ctx: RangeEligibilityCtx
}): { eligible: true } | { eligible: false; reason: EligibilityReason } {
  const { reqStart, reqEnd, reqStartDate, busyStart, busyEnd, busyStartDate, ctx } = params
  const req = normalizeRange(reqStart, reqEnd)
  const busy = normalizeRange(busyStart, busyEnd)

  const overlap = req.start < busy.end && req.end > busy.start
  if (overlap) return { eligible: false, reason: 'overlap' }

  if (!ctx.allowMultipleEventsSameDay && reqStartDate === busyStartDate) {
    return { eligible: false, reason: 'same_day_not_allowed' }
  }

  const requireMinRest = shouldRequireMinRest({
    reqStart: req.start,
    reqEnd: req.end,
    reqStartDate,
    busyStart: busy.start,
    busyEnd: busy.end,
    busyStartDate,
    ctx,
  })

  if (requireMinRest) {
    const restGap = Math.max(
      hoursBetween(busy.end, req.start),
      hoursBetween(req.end, busy.start)
    )
    if (restGap < ctx.restHours) return { eligible: false, reason: 'rest_violation' }
  }

  return { eligible: true }
}

export function isEligibleByName(
  personName: string,
  startISO: string,
  endISO: string,
  ctx: EligibilityCtx
) {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const reqStartDate = startISO.slice(0, 10)
  const personKey = norm(personName)

  for (const q of ctx.busyAssignments) {
    const their = new Set<string>(
      [
        ...(q.treballadors || []).map((x: AssignmentPerson) => x.name),
        ...(q.conductors || []).map((x: AssignmentPerson) => x.name),
        ...(q.responsables || []).map((x: AssignmentPerson) => x.name),
        q.responsable?.name,
        q.responsableName || undefined,
        ...(q.groups || []).map((g) => g?.responsibleName || undefined),
      ]
        .filter(Boolean)
        .map((name) => norm(String(name))) as string[]
    )

    if (!their.has(personKey)) continue

    const busyStart = new Date(toISO(q.startDate, q.startTime))
    const busyEnd = new Date(toISO(q.endDate, q.endTime))
    const result = evaluateRangeEligibility({
      reqStart: start,
      reqEnd: end,
      reqStartDate,
      busyStart,
      busyEnd,
      busyStartDate: q.startDate,
      ctx,
    })
    if (!result.eligible) return result
  }

  return { eligible: true as const }
}

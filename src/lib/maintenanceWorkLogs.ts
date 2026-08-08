export type MaintenanceWorkLogEntry = {
  at?: number | string | null
  startTime?: string | null
  endTime?: string | null
  byId?: string | null
  byName?: string | null
  note?: string | null
  sourceStatus?: string | null
  closedByStatus?: string | null
}

function parseHistoryAtMs(at?: number | string | null): number | null {
  if (at === null || at === undefined) return null
  if (typeof at === 'number' && Number.isFinite(at)) return at < 1e12 ? at * 1000 : at
  const parsed = Date.parse(String(at))
  return Number.isFinite(parsed) ? parsed : null
}

function parseHistoryTime(at?: number | string | null, time?: string | null): Date | null {
  if (!time) return null
  const baseMs = parseHistoryAtMs(at)
  if (!baseMs) return null
  const [hoursRaw, minutesRaw] = String(time).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const next = new Date(baseMs)
  next.setHours(hours, minutes, 0, 0)
  return next
}

export function computeWorkLogMinutes(logs?: MaintenanceWorkLogEntry[] | null) {
  const entries = Array.isArray(logs)
    ? logs.slice().sort((a, b) => (parseHistoryAtMs(a.at) || 0) - (parseHistoryAtMs(b.at) || 0))
    : []
  const closedSegmentsSeen = new Set<string>()
  let totalMs = 0
  for (const entry of entries) {
    const start = parseHistoryTime(entry.at, entry.startTime)
    const end = parseHistoryTime(entry.at, entry.endTime)
    if (!start || !end) continue
    const key = `${parseHistoryAtMs(entry.at) || 0}|${entry.startTime || ''}|${entry.endTime || ''}|${entry.byId || ''}|${entry.sourceStatus || ''}`
    if (closedSegmentsSeen.has(key)) continue
    closedSegmentsSeen.add(key)
    const diff = end.getTime() - start.getTime()
    if (diff > 0) totalMs += diff
  }
  return Math.round(totalMs / 60_000)
}

export function computeOperatorWorkLogMinutes(
  logs: MaintenanceWorkLogEntry[] | null | undefined,
  operatorId: string
) {
  const id = String(operatorId || '').trim()
  if (!id || !Array.isArray(logs)) return 0
  return computeWorkLogMinutes(logs.filter((item) => String(item.byId || '').trim() === id))
}

export function workLogsInvolveOperator(
  logs: MaintenanceWorkLogEntry[] | null | undefined,
  operatorId: string
) {
  const id = String(operatorId || '').trim()
  if (!id || !Array.isArray(logs)) return false
  return logs.some((item) => String(item.byId || '').trim() === id)
}

/** HH:MM in Europe/Madrid — used when planners resolve without a client end time. */
export function formatMadridClockTime(at: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at))
  const hour = parts.find((part) => part.type === 'hour')?.value || '00'
  const minute = parts.find((part) => part.type === 'minute')?.value || '00'
  return `${hour}:${minute}`
}

/**
 * Close every open workLog segment (endTime empty).
 * Used when a planner/admin forces Fet via Resoldre — workers own the
 * byId-scoped applyWorkLogUpdate path, so admin resolves otherwise leave
 * open segments forever and computeWorkLogMinutes drops those minutes.
 */
export function closeOpenWorkLogs(
  logs: MaintenanceWorkLogEntry[],
  params: {
    at: number
    endTime: string
    closedByStatus?: string | null
    note?: string | null
  }
): MaintenanceWorkLogEntry[] {
  const endTime = String(params.endTime || '').trim()
  if (!endTime) return logs.map((entry) => ({ ...entry }))

  const note = String(params.note || '').trim() || null
  const closedByStatus = String(params.closedByStatus || '').trim() || null

  return logs.map((entry) => {
    const start = String(entry.startTime || '').trim()
    const end = String(entry.endTime || '').trim()
    if (!start || end) return { ...entry }
    return {
      ...entry,
      endTime,
      closedByStatus: closedByStatus ?? entry.closedByStatus ?? null,
      note: note ?? entry.note ?? null,
    }
  })
}

/**
 * When planner/admin resolve forces status to Fet, close any open workLogs
 * so already-worked minutes are not permanently dropped.
 */
export function closeOpenWorkLogsForDirectResolution(
  logs: MaintenanceWorkLogEntry[] | null | undefined,
  params: {
    at?: number
    endTime?: string | null
    note?: string | null
    closedByStatus?: string | null
  } = {}
): MaintenanceWorkLogEntry[] {
  const at = typeof params.at === 'number' && Number.isFinite(params.at) ? params.at : Date.now()
  const endTime = String(params.endTime || '').trim() || formatMadridClockTime(at)
  const closedByStatus = String(params.closedByStatus || '').trim() || 'fet'
  const current = Array.isArray(logs) ? logs : []
  return closeOpenWorkLogs(current, {
    at,
    endTime,
    closedByStatus,
    note: params.note ?? null,
  })
}

/**
 * Managers/caps on the Fulls journey can set en_curs → fet/espera/… without
 * going through applyWorkLogUpdate (that helper is byId-scoped to the actor).
 * Detect that gap so the route can close open segments before minutes are lost.
 */
export function shouldCloseOpenWorkLogsForNonWorkerStatusExit(params: {
  currentStatus: string
  nextStatus: string | null | undefined
  workLogsAlreadyUpdated: boolean
}): boolean {
  if (params.workLogsAlreadyUpdated) return false
  const current = String(params.currentStatus || '').trim()
  const next = String(params.nextStatus || '').trim()
  return current === 'en_curs' && Boolean(next) && next !== 'en_curs'
}

export function applyWorkLogUpdate(
  logs: MaintenanceWorkLogEntry[],
  currentStatus: string,
  nextStatus: string,
  params: {
    at: number
    closeSegmentEndTime?: string | null
    newSegmentStartTime?: string | null
    fallbackOpenStartTime?: string | null
    note?: string | null
    userId: string
    userName: string
  }
) {
  const next = logs.map((entry) => ({ ...entry }))
  const current = String(currentStatus || '').trim()
  const upcoming = String(nextStatus || '').trim()
  const closeEnd = String(params.closeSegmentEndTime || '').trim()
  const newStart = String(params.newSegmentStartTime || '').trim()
  const fallbackOpenStart = String(params.fallbackOpenStartTime || '').trim()
  const note = String(params.note || '').trim() || null

  if (current === 'en_curs' && closeEnd) {
    let closed = false
    for (let i = next.length - 1; i >= 0; i--) {
      const entry = next[i]
      const start = String(entry.startTime || '').trim()
      const end = String(entry.endTime || '').trim()
      const byId = String(entry.byId || '').trim()
      if (!start || end) continue
      if (byId && byId !== params.userId) continue
      next[i] = {
        ...entry,
        endTime: closeEnd,
        closedByStatus: upcoming || null,
        note: note ?? entry.note ?? null,
      }
      closed = true
      break
    }
    if (!closed && fallbackOpenStart) {
      next.push({
        at: params.at,
        startTime: fallbackOpenStart,
        endTime: closeEnd,
        byId: params.userId,
        byName: params.userName,
        note,
        sourceStatus: 'en_curs',
        closedByStatus: upcoming || null,
      })
    }
  }

  if (upcoming === 'en_curs' && newStart) {
    next.push({
      at: params.at,
      startTime: newStart,
      endTime: null,
      byId: params.userId,
      byName: params.userName,
      note,
      sourceStatus: 'en_curs',
      closedByStatus: null,
    })
  }

  return next
}

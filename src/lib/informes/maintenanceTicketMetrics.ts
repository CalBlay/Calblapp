/** Càlcul de minuts de treball a partir de `statusHistory` (segments inici/fi). */

export type WorkHistoryEntry = {
  at?: number | string | null
  startTime?: string | null
  endTime?: string | null
  byId?: string | null
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

/** Minuts registrats amb parells inici/fi (inclou preventius amb `at` + hora). */
export function computeHistoryWorkMinutes(history?: WorkHistoryEntry[] | null) {
  const entries = Array.isArray(history)
    ? history.slice().sort((a, b) => (parseHistoryAtMs(a.at) || 0) - (parseHistoryAtMs(b.at) || 0))
    : []
  let openStart: Date | null = null
  let totalMs = 0
  for (const entry of entries) {
    const start = parseHistoryTime(entry.at, entry.startTime)
    const end = parseHistoryTime(entry.at, entry.endTime)
    if (start && end) {
      const diff = end.getTime() - start.getTime()
      if (diff > 0) totalMs += diff
      openStart = null
      continue
    }
    if (start) openStart = start
    if (end && openStart) {
      const diff = end.getTime() - openStart.getTime()
      if (diff > 0) totalMs += diff
      openStart = null
    }
  }
  if (totalMs > 0) return Math.round(totalMs / 60_000)

  return history?.reduce(
    (total, item) => total + getMinutesFromTimeRange(item.startTime, item.endTime),
    0
  ) || 0
}

export function getMinutesFromTimeRange(start?: string | null, end?: string | null) {
  if (!start || !end) return 0
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute))
}

export type StatusHistoryEntry = WorkHistoryEntry

export function computeTicketWorkMinutes(history?: StatusHistoryEntry[] | null) {
  return computeHistoryWorkMinutes(history)
}

/** Minuts de treball atribuïts a un operari (segments amb el seu `byId`). */
export function computeOperatorWorkMinutes(
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string
) {
  const id = String(operatorId || '').trim()
  if (!id || !Array.isArray(history)) return 0
  const operatorHistory = history.filter((item) => String(item.byId || '').trim() === id)
  return computeHistoryWorkMinutes(operatorHistory)
}

export function ticketInvolvesOperator(
  assigneeIds: string[],
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string
) {
  const id = String(operatorId || '').trim()
  if (!id) return true
  if (assigneeIds.includes(id)) return true
  if (!Array.isArray(history)) return false
  return history.some((item) => String(item.byId || '').trim() === id)
}

/** Minuts de treball per informe: si hi ha filtre d'operari, només els seus segments (o tot el ticket si està assignat). */
export function resolveTicketWorkMinutesForReport(
  history: StatusHistoryEntry[] | null | undefined,
  assigneeIds: string[],
  operatorId?: string
) {
  const total = computeTicketWorkMinutes(history)
  if (!operatorId) return total
  const operatorMinutes = computeOperatorWorkMinutes(history, operatorId)
  if (operatorMinutes > 0) return operatorMinutes
  if (assigneeIds.includes(operatorId)) return total
  return 0
}

export function workInvolvesOperator(
  workerIds: string[],
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string
) {
  return ticketInvolvesOperator(workerIds, history, operatorId)
}

export function resolvePreventiuWorkMinutesForReport(
  history: StatusHistoryEntry[] | null | undefined,
  workerIds: string[],
  plannedMinutes: number,
  operatorId?: string
) {
  const tracked = computeHistoryWorkMinutes(history)
  const total = tracked > 0 ? tracked : plannedMinutes
  if (!operatorId) return total
  const operatorMinutes = computeOperatorWorkMinutes(history, operatorId)
  if (operatorMinutes > 0) return operatorMinutes
  if (workerIds.includes(operatorId)) return total
  return 0
}

export function getPlannedSlotMinutes(start?: string | null, end?: string | null) {
  return getMinutesFromTimeRange(start, end)
}

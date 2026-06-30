import {
  computeOperatorWorkLogMinutes,
  computeWorkLogMinutes,
  workLogsInvolveOperator,
  type MaintenanceWorkLogEntry,
} from '@/lib/maintenanceWorkLogs'

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

export function computeHistoryWorkMinutes(history?: WorkHistoryEntry[] | null) {
  const entries = Array.isArray(history)
    ? history.slice().sort((a, b) => (parseHistoryAtMs(a.at) || 0) - (parseHistoryAtMs(b.at) || 0))
    : []
  const closedSegmentsSeen = new Set<string>()
  let openStart: Date | null = null
  let totalMs = 0
  for (const entry of entries) {
    const start = parseHistoryTime(entry.at, entry.startTime)
    const end = parseHistoryTime(entry.at, entry.endTime)
    if (start && end) {
      const key = `${parseHistoryAtMs(entry.at) || 0}|${entry.startTime || ''}|${entry.endTime || ''}|${entry.byId || ''}`
      if (closedSegmentsSeen.has(key)) continue
      closedSegmentsSeen.add(key)
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

export function computeTicketWorkMinutes(
  history?: StatusHistoryEntry[] | null,
  workLogs?: MaintenanceWorkLogEntry[] | null
) {
  if (Array.isArray(workLogs) && workLogs.length > 0) {
    return computeWorkLogMinutes(workLogs)
  }
  return computeHistoryWorkMinutes(history)
}

export function computeOperatorWorkMinutes(
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string,
  workLogs?: MaintenanceWorkLogEntry[] | null | undefined
) {
  if (Array.isArray(workLogs) && workLogs.length > 0) {
    return computeOperatorWorkLogMinutes(workLogs, operatorId)
  }
  const id = String(operatorId || '').trim()
  if (!id || !Array.isArray(history)) return 0
  const operatorHistory = history.filter((item) => String(item.byId || '').trim() === id)
  return computeHistoryWorkMinutes(operatorHistory)
}

export function ticketInvolvesOperator(
  assigneeIds: string[],
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string,
  workLogs?: MaintenanceWorkLogEntry[] | null | undefined
) {
  const id = String(operatorId || '').trim()
  if (!id) return true
  if (assigneeIds.includes(id)) return true
  if (Array.isArray(workLogs) && workLogs.length > 0) {
    return workLogsInvolveOperator(workLogs, operatorId)
  }
  if (!Array.isArray(history)) return false
  return history.some((item) => String(item.byId || '').trim() === id)
}

export function resolveTicketWorkMinutesForReport(
  history: StatusHistoryEntry[] | null | undefined,
  assigneeIds: string[],
  operatorId?: string,
  workLogs?: MaintenanceWorkLogEntry[] | null | undefined
) {
  const total = computeTicketWorkMinutes(history, workLogs)
  if (!operatorId) return total
  const operatorMinutes = computeOperatorWorkMinutes(history, operatorId, workLogs)
  if (operatorMinutes > 0) return operatorMinutes
  if (assigneeIds.includes(operatorId)) return total
  return 0
}

export function workInvolvesOperator(
  workerIds: string[],
  history: StatusHistoryEntry[] | null | undefined,
  operatorId: string,
  workLogs?: MaintenanceWorkLogEntry[] | null | undefined
) {
  return ticketInvolvesOperator(workerIds, history, operatorId, workLogs)
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

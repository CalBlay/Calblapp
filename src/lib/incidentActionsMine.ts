import { isBefore, parseISO, startOfDay } from 'date-fns'
import {
  normalizeIncidentActionStatus,
  type IncidentActionStatus,
} from '@/lib/incidentPolicy'

export type IncidentActionMineIncidentMeta = {
  incidentNumber: string | null
  eventTitle: string | null
  eventCode: string | null
  eventDate: string | null
  department: string | null
}

export type IncidentActionMineRow = {
  id: string
  incidentId: string
  title: string
  description: string
  status: IncidentActionStatus
  assignedToName: string
  department: string
  dueAt: string
  createdAt: string
  closedAt: string
  incident: IncidentActionMineIncidentMeta
}

export function isPendingIncidentActionStatus(status: IncidentActionStatus) {
  return status === 'open' || status === 'in_progress'
}

export function isOverdueIncidentAction(
  row: Pick<IncidentActionMineRow, 'dueAt' | 'status'>,
  now: Date = new Date()
) {
  const st = normalizeIncidentActionStatus(row.status)
  if (!isPendingIncidentActionStatus(st)) return false
  const dueRaw = String(row.dueAt || '').trim()
  if (!dueRaw) return false
  const due = parseISO(dueRaw.slice(0, 10))
  if (Number.isNaN(due.getTime())) return false
  return isBefore(due, startOfDay(now))
}

function incidentShortLabel(meta: IncidentActionMineIncidentMeta | undefined, incidentId: string) {
  if (!meta) return incidentId.slice(0, 8)
  const num = (meta.incidentNumber || '').trim()
  const title = (meta.eventTitle || '').trim().split('/')[0].trim()
  const code = (meta.eventCode || '').trim()
  const bits = [
    num || null,
    code || null,
    title ? title.slice(0, 48) + (title.length > 48 ? '…' : '') : null,
  ].filter(Boolean) as string[]
  return bits.length ? bits.join(' · ') : incidentId.slice(0, 8)
}

export function incidentActionMineSearchBlob(
  row: IncidentActionMineRow,
  incidentLabel: string
): string {
  return [
    row.title,
    row.department,
    row.assignedToName,
    incidentLabel,
    row.incident.incidentNumber,
    row.incident.eventTitle,
    row.incident.eventCode,
    row.incident.eventDate,
    row.incident.department,
  ]
    .map((x) => String(x ?? '').toLowerCase())
    .join(' ')
}

export function buildIncidentActionMineLabel(row: IncidentActionMineRow) {
  return incidentShortLabel(row.incident, row.incidentId)
}

export type MineActionsFilter = {
  status?: 'pending' | 'all' | IncidentActionStatus
  q?: string
  overdueOnly?: boolean
  /** Injected clock for overdue checks (defaults to now). */
  now?: Date
}

export function filterMineIncidentActions(
  rows: IncidentActionMineRow[],
  filter: MineActionsFilter
) {
  const q = String(filter.q || '')
    .trim()
    .toLowerCase()
  const status = filter.status || 'pending'
  const now = filter.now ?? new Date()

  return rows.filter((row) => {
    const st = normalizeIncidentActionStatus(row.status)
    if (status === 'pending') {
      if (!isPendingIncidentActionStatus(st)) return false
    } else if (status !== 'all' && st !== status) {
      return false
    }

    if (filter.overdueOnly && !isOverdueIncidentAction(row, now)) return false

    if (q) {
      const label = buildIncidentActionMineLabel(row)
      const blob = incidentActionMineSearchBlob(row, label)
      if (!blob.includes(q)) return false
    }

    return true
  })
}

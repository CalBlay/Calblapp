'use client'

import { differenceInCalendarDays, format } from 'date-fns'
import type { Ticket, TicketStatus } from '@/app/menu/manteniment/tickets/types'
import type {
  CompletedRecord,
  MaintenanceStatus,
  PlannedPreventiuApiItem,
  Preventiu,
  WorkHistoryEntry,
} from './types'

export const STATUSES: MaintenanceStatus[] = [
  'nou',
  'assignat',
  'en_curs',
  'espera',
  'fet',
  'no_fet',
  'resolut',
  'validat',
]

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'En espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Resolt',
  validat: 'Validat',
}

export const PRIORITY_BADGES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  alta: 'bg-orange-100 text-orange-700',
  normal: 'bg-slate-100 text-slate-700',
  baixa: 'bg-blue-100 text-blue-700',
}

export const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const parseDate = (value?: number | string | null) => {
  if (!value && value !== 0) return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const parseDateFromParts = (date?: string | null, time?: string | null) =>
  parseDate(date ? `${date}T${time || '00:00'}:00` : null)

export const formatDateTime = (value?: number | string | null) =>
  parseDate(value) ? format(parseDate(value) as Date, 'dd/MM/yyyy HH:mm') : '-'

export const normalizeStatus = (value?: string | null): MaintenanceStatus => {
  const raw = String(value || 'assignat').trim().toLowerCase()
  if (raw === 'nou') return 'nou'
  if (raw === 'assignat' || raw === 'pendent') return 'assignat'
  if (raw === 'en_curs' || raw === 'en curs') return 'en_curs'
  if (raw === 'espera') return 'espera'
  if (raw === 'fet') return 'fet'
  if (raw === 'no_fet' || raw === 'no fet') return 'no_fet'
  if (raw === 'resolut') return 'resolut'
  if (raw === 'validat') return 'validat'
  return 'assignat'
}

export const getDaysOpen = (value?: number | string | null) =>
  parseDate(value)
    ? Math.max(0, differenceInCalendarDays(new Date(), parseDate(value) as Date))
    : null

export const getDaysBadge = (days: number | null) =>
  days === null
    ? 'bg-slate-100 text-slate-600'
    : days >= 8
      ? 'bg-red-100 text-red-700'
      : days >= 3
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700'

export const parseHistoryTime = (at?: number | string | null, time?: string | null) => {
  if (!time) return null
  const base = parseDate(at)
  if (!base) return null
  const [hoursRaw, minutesRaw] = String(time).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const next = new Date(base)
  next.setHours(hours, minutes, 0, 0)
  return next
}

export const getTrackedMinutes = (history?: WorkHistoryEntry[]) => {
  const entries = Array.isArray(history)
    ? history
        .slice()
        .sort(
          (a, b) =>
            (parseDate(a.at)?.getTime() || 0) - (parseDate(b.at)?.getTime() || 0)
        )
    : []
  let openStart: Date | null = null
  let total = 0
  entries.forEach((entry) => {
    const start = parseHistoryTime(entry.at, entry.startTime)
    const end = parseHistoryTime(entry.at, entry.endTime)
    if (start && end) {
      const diff = end.getTime() - start.getTime()
      if (diff > 0) total += diff
      openStart = null
      return
    }
    if (start) openStart = start
    if (end && openStart) {
      const diff = end.getTime() - openStart.getTime()
      if (diff > 0) total += diff
      openStart = null
    }
  })
  return Math.round(total / 60000)
}

export const getTicketTrackedMinutes = (ticket: Ticket) =>
  getTrackedMinutes(ticket.workLogs?.length ? ticket.workLogs : ticket.statusHistory)

const hoursNumberFormatter = new Intl.NumberFormat('ca-ES', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatTrackedHours = (minutes: number) => {
  if (!minutes) return '--'
  return `${hoursNumberFormatter.format(minutes / 60)} h`
}

export const getMinutesFromTime = (value?: string | null) => {
  if (!value) return null
  const [hoursRaw, minutesRaw] = String(value).split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export const getPlannedMinutes = (
  start?: string | null,
  end?: string | null,
  fallback?: number | null
) => {
  const startMinutes = getMinutesFromTime(start)
  const endMinutes = getMinutesFromTime(end)
  if (startMinutes !== null && endMinutes !== null && endMinutes > startMinutes) {
    return endMinutes - startMinutes
  }
  return typeof fallback === 'number' && fallback > 0 ? fallback : 0
}

export const normalizeMachineLabel = (
  value?: string | null,
  machineNameMap?: Map<string, string>
) => {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  if (machineNameMap?.has(raw)) return machineNameMap.get(raw) || raw
  if (raw.includes('·')) return raw.split('·').slice(1).join('·').trim() || raw
  const dashMatch = raw.match(/^[A-Z0-9-]+\s*-\s*(.+)$/i)
  if (dashMatch?.[1]) return dashMatch[1].trim()
  return raw
}

export const getTicketCompletionAttachments = (ticket: Ticket) =>
  Array.isArray(ticket.completionAttachments)
    ? ticket.completionAttachments.filter((item) => item?.url || item?.path)
    : []

export const isMediaAttachment = (mimeType?: string | null) => {
  const normalized = String(mimeType || '').trim().toLowerCase()
  return normalized.startsWith('image/') || normalized.startsWith('video/')
}

export function buildSeguimentRows(
  ticketsJson: unknown,
  plannedJson: unknown,
  completedJson: unknown
) {
  const nextTickets = Array.isArray((ticketsJson as { tickets?: unknown })?.tickets)
    ? (ticketsJson as { tickets: Ticket[] }).tickets.map((ticket: Ticket) => ({
        ...ticket,
        status: normalizeStatus(ticket.status) as TicketStatus,
      }))
    : []

  const records = Array.isArray((completedJson as { records?: unknown })?.records)
    ? (completedJson as { records: CompletedRecord[] }).records
    : []

  const latestByPlannedId = new Map<string, CompletedRecord>()
  records.forEach((record) => {
    const plannedId = String(record.plannedId || '').trim()
    if (!plannedId) return
    const current = latestByPlannedId.get(plannedId)
    const currentTime = parseDate(current?.completedAt || current?.updatedAt)?.getTime() || 0
    const nextTime = parseDate(record.completedAt || record.updatedAt)?.getTime() || 0
    if (!current || nextTime >= currentTime) latestByPlannedId.set(plannedId, record)
  })

  const items = Array.isArray((plannedJson as { items?: unknown })?.items)
    ? (plannedJson as { items: PlannedPreventiuApiItem[] }).items
    : []

  const nextPreventius: Preventiu[] = items.map((item) => {
    const record = latestByPlannedId.get(String(item.id)) || null
    const history = Array.isArray(record?.statusHistory)
      ? record.statusHistory.map((entry) => ({
          ...entry,
          status: normalizeStatus(entry.status),
          at: parseDate(entry.at)?.getTime() || 0,
        }))
      : []

    return {
      id: String(item.id || ''),
      title: String(item.title || 'Preventiu'),
      location: String(item.location || ''),
      workerNames: Array.isArray(item.workerNames)
        ? item.workerNames.map(String).filter(Boolean)
        : [],
      status: normalizeStatus(
        record?.status ||
          item.lastStatus ||
          (Array.isArray(item.workerNames) && item.workerNames.length ? 'assignat' : 'nou')
      ),
      progress: typeof item.lastProgress === 'number' ? item.lastProgress : null,
      plannedDate: item.date || null,
      plannedStart: item.startTime || null,
      plannedEnd: item.endTime || null,
      createdAt:
        item.createdAt || parseDateFromParts(item.date, item.startTime)?.getTime() || null,
      updatedAt: item.lastUpdatedAt || record?.updatedAt || item.updatedAt || null,
      completedAt: record?.completedAt || item.lastCompletedAt || null,
      recordId: record?.id || item.lastRecordId || null,
      notes: String(record?.notes || '').trim() || null,
      checklist:
        record?.checklist && typeof record.checklist === 'object' ? record.checklist : undefined,
      history,
    }
  })

  return { nextTickets, nextPreventius }
}

import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { ca } from 'date-fns/locale'
import {
  INCIDENT_ACTION_STATUS,
  type IncidentActionStatus,
  normalizeIncidentActionStatus,
} from '@/lib/incidentPolicy'

export type BatchActionRow = {
  id: string
  incidentId: string
  title: string
  description: string
  status: string
  assignedToName: string
  department: string
  dueAt: string
  createdAt: string
  closedAt?: string
}

export type IncidentMetaForActions = {
  id: string
  incidentNumber?: string | null
  eventTitle?: string | null
  eventCode?: string | null
  eventDate?: string | null
}

const ACTION_STATUS_ORDER: IncidentActionStatus[] = [...INCIDENT_ACTION_STATUS]

export const incidentActionStatusLabel: Record<IncidentActionStatus, string> = {
  open: 'Oberta',
  in_progress: 'En curs',
  done: 'Feta',
  cancelled: 'Cancel·lada',
}

function shortDate(iso: string) {
  if (!iso || iso.length < 10) return '—'
  const d = parseISO(iso.slice(0, 10))
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return format(d, 'd MMM yyyy', { locale: ca })
}

function incidentShortLabel(meta: IncidentMetaForActions | undefined) {
  if (!meta) return '—'
  const num = (meta.incidentNumber || '').trim()
  const title = (meta.eventTitle || '').trim().split('/')[0].trim()
  const code = (meta.eventCode || '').trim()
  const bits = [num || null, code || null, title ? title.slice(0, 48) + (title.length > 48 ? '…' : '') : null].filter(
    Boolean
  ) as string[]
  return bits.length ? bits.join(' · ') : meta.id.slice(0, 8)
}

export function buildIncidentActionsDashboardStats(
  actions: BatchActionRow[],
  incidents: IncidentMetaForActions[]
) {
  const metaById = new Map<string, IncidentMetaForActions>()
  incidents.forEach((i) => {
    if (i.id) metaById.set(i.id, i)
  })

  const today = startOfDay(new Date())

  const byStatus: Record<IncidentActionStatus, number> = {
    open: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
  }

  const deptMap = new Map<string, number>()
  let overdue = 0

  for (const a of actions) {
    const st = normalizeIncidentActionStatus(a.status)
    byStatus[st] += 1

    const dep = (a.department || '').trim() || 'Sense departament'
    deptMap.set(dep, (deptMap.get(dep) || 0) + 1)

    if (a.dueAt && (st === 'open' || st === 'in_progress')) {
      const due = parseISO(a.dueAt.slice(0, 10))
      if (!Number.isNaN(due.getTime()) && isBefore(due, today)) {
        overdue += 1
      }
    }
  }

  const statusChart = ACTION_STATUS_ORDER.filter((k) => byStatus[k] > 0).map((k) => ({
    name: incidentActionStatusLabel[k],
    value: byStatus[k],
  }))

  const deptChart = [...deptMap.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([name, value]) => ({ name, value }))

  const tableRows = actions.map((a) => {
    const st = normalizeIncidentActionStatus(a.status)
    const dueShort = a.dueAt ? shortDate(a.dueAt) : '—'
    const createdShort = a.createdAt ? shortDate(a.createdAt) : '—'
    let isOverdue = false
    if (a.dueAt && (st === 'open' || st === 'in_progress')) {
      const due = parseISO(a.dueAt.slice(0, 10))
      if (!Number.isNaN(due.getTime()) && isBefore(due, today)) isOverdue = true
    }
    return {
      actionId: a.id,
      incidentId: a.incidentId,
      incidentLabel: incidentShortLabel(metaById.get(a.incidentId)),
      title: a.title || '—',
      status: st,
      statusLabel: incidentActionStatusLabel[st],
      department: (a.department || '').trim() || '—',
      assignedToName: (a.assignedToName || '').trim() || '—',
      dueAt: a.dueAt,
      dueAtShort: dueShort,
      createdAt: a.createdAt,
      createdAtShort: createdShort,
      isOverdue,
    }
  })

  return {
    total: actions.length,
    byStatus,
    statusChart,
    deptChart,
    overdue,
    tableRows,
    actionStatusOrder: ACTION_STATUS_ORDER,
  }
}

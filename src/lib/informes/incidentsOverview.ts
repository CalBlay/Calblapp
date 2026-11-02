import { normalizeDepartmentLabel } from '@/data/departments'
import { normalizeIncidentStatus, type IncidentWorkflowStatus } from '@/lib/incidentPolicy'

export type IncidentReportRow = {
  id: string
  incidentNumber: string
  createdAt: number
  eventDate: string
  eventCode: string
  eventTitle: string
  eventLocation: string
  department: string
  importance: string
  status: IncidentWorkflowStatus
  categoryId: string
  categoryLabel: string
  createdBy: string
  description: string
  resolvedAt: number
}

export type IncidentReportKpis = {
  total: number
  open: number
  inProgress: number
  resolved: number
  closed: number
  highPriority: number
  resolutionPct: number
  averageResolutionHours: number | null
}

export type IncidentsOverview = {
  period: { dateFrom: string; dateTo: string }
  scope: { allDepartments: boolean; department: string }
  kpis: IncidentReportKpis
  previousKpis: IncidentReportKpis
  byStatus: Array<{ status: IncidentWorkflowStatus; count: number }>
  byDepartment: Array<{ department: string; count: number; open: number; resolutionPct: number }>
  byCategory: Array<{ id: string; label: string; count: number; open: number }>
  trend: Array<{ date: string; count: number }>
  rows: IncidentReportRow[]
  filterOptions: { departments: string[]; categories: Array<{ value: string; label: string }> }
}

const dayStart = (ymd: string) => new Date(`${ymd}T00:00:00`).getTime()
const dayEnd = (ymd: string) => new Date(`${ymd}T23:59:59.999`).getTime()
const round1 = (value: number) => Math.round(value * 10) / 10
const isFinished = (status: IncidentWorkflowStatus) => status === 'resolt' || status === 'tancat'

function summarize(rows: IncidentReportRow[]): IncidentReportKpis {
  const resolutionHours = rows.flatMap((row) =>
    isFinished(row.status) && row.resolvedAt > row.createdAt
      ? [(row.resolvedAt - row.createdAt) / 3_600_000]
      : []
  )
  const resolved = rows.filter((row) => row.status === 'resolt').length
  const closed = rows.filter((row) => row.status === 'tancat').length
  return {
    total: rows.length,
    open: rows.filter((row) => row.status === 'obert').length,
    inProgress: rows.filter((row) => row.status === 'en_curs').length,
    resolved,
    closed,
    highPriority: rows.filter((row) => ['alta', 'urgent'].includes(row.importance)).length,
    resolutionPct: rows.length ? round1(((resolved + closed) / rows.length) * 100) : 0,
    averageResolutionHours: resolutionHours.length
      ? round1(resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length)
      : null,
  }
}

export function buildIncidentsOverview(params: {
  incidents: IncidentReportRow[]
  dateFrom: string
  dateTo: string
  previousDateFrom: string
  previousDateTo: string
  scope: { allDepartments: boolean; department: string }
  filters?: { department?: string; category?: string; status?: string; importance?: string }
}): IncidentsOverview {
  const scoped = params.incidents.filter((row) => {
    if (!params.scope.allDepartments) {
      if (normalizeDepartmentLabel(row.department) !== normalizeDepartmentLabel(params.scope.department)) return false
    }
    if (params.filters?.department && normalizeDepartmentLabel(row.department) !== normalizeDepartmentLabel(params.filters.department)) return false
    if (params.filters?.category && row.categoryId !== params.filters.category) return false
    if (params.filters?.status && row.status !== params.filters.status) return false
    if (params.filters?.importance && row.importance !== params.filters.importance) return false
    return true
  })

  const current = scoped.filter((row) => row.createdAt >= dayStart(params.dateFrom) && row.createdAt <= dayEnd(params.dateTo))
  const previous = scoped.filter((row) => row.createdAt >= dayStart(params.previousDateFrom) && row.createdAt <= dayEnd(params.previousDateTo))
  const optionRows = params.incidents.filter((row) =>
    params.scope.allDepartments || normalizeDepartmentLabel(row.department) === normalizeDepartmentLabel(params.scope.department)
  )

  const departmentMap = new Map<string, IncidentReportRow[]>()
  const categoryMap = new Map<string, IncidentReportRow[]>()
  const trendMap = new Map<string, number>()
  for (const row of current) {
    const department = row.department || 'Sense departament'
    departmentMap.set(department, [...(departmentMap.get(department) || []), row])
    const categoryKey = `${row.categoryId}\u0000${row.categoryLabel || row.categoryId || 'Sense tipologia'}`
    categoryMap.set(categoryKey, [...(categoryMap.get(categoryKey) || []), row])
    const date = new Date(row.createdAt).toISOString().slice(0, 10)
    trendMap.set(date, (trendMap.get(date) || 0) + 1)
  }

  const categories = new Map<string, string>()
  optionRows.forEach((row) => {
    if (row.categoryId) categories.set(row.categoryId, row.categoryLabel || row.categoryId)
  })

  return {
    period: { dateFrom: params.dateFrom, dateTo: params.dateTo },
    scope: params.scope,
    kpis: summarize(current),
    previousKpis: summarize(previous),
    byStatus: (['obert', 'en_curs', 'resolt', 'tancat'] as IncidentWorkflowStatus[]).map((status) => ({
      status,
      count: current.filter((row) => row.status === status).length,
    })),
    byDepartment: Array.from(departmentMap, ([department, rows]) => ({
      department,
      count: rows.length,
      open: rows.filter((row) => !isFinished(row.status)).length,
      resolutionPct: summarize(rows).resolutionPct,
    })).sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, 'ca')),
    byCategory: Array.from(categoryMap, ([key, rows]) => {
      const [id, label] = key.split('\u0000')
      return { id, label, count: rows.length, open: rows.filter((row) => !isFinished(row.status)).length }
    }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ca')),
    trend: Array.from(trendMap, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    rows: [...current].sort((a, b) => b.createdAt - a.createdAt),
    filterOptions: {
      departments: Array.from(new Set(optionRows.map((row) => row.department).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ca')),
      categories: Array.from(categories, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'ca')),
    },
  }
}

export function normalizeIncidentReportRow(id: string, data: Record<string, unknown>): IncidentReportRow {
  const timestamp = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return Date.parse(value) || 0
    if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      return Number((value as { toMillis: () => number }).toMillis()) || 0
    }
    return 0
  }
  const category = (data.category || {}) as Record<string, unknown>
  return {
    id,
    incidentNumber: String(data.incidentNumber || ''),
    createdAt: timestamp(data.createdAt),
    eventDate: String(data.eventDate || ''),
    eventCode: String(data.eventCode || ''),
    eventTitle: String(data.eventTitle || ''),
    eventLocation: String(data.eventLocation || ''),
    department: String(data.department || '').trim(),
    importance: String(data.importance || 'normal').trim().toLowerCase(),
    status: normalizeIncidentStatus(String(data.status || '')),
    categoryId: String(category.id || '').trim(),
    categoryLabel: String(category.label || '').trim(),
    createdBy: String(data.createdBy || '').trim(),
    description: String(data.description || '').trim(),
    resolvedAt: timestamp(data.resolvedAt || data.updatedAt),
  }
}

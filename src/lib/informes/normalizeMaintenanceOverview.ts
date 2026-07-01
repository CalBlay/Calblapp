import type {
  MaintenanceAssigneeRow,
  MaintenanceLocationRow,
  MaintenanceMonthSeriesRow,
  MaintenanceOverview,
  MaintenanceWorkReportRow,
} from '@/lib/informes/maintenanceOverview'

type LegacyRow = Partial<MaintenanceWorkReportRow> & {
  ticketCode?: string
  ticketType?: string
}

function normalizeEntry(row: LegacyRow): MaintenanceWorkReportRow {
  const kind = row.kind === 'preventiu' ? 'preventiu' : 'ticket'
  const legacyType = String(row.ticketType || row.category || '').trim()
  const category =
    row.category ||
    (kind === 'preventiu'
      ? 'Preventiu'
      : legacyType === 'deco' || legacyType === 'Decoració'
        ? 'Decoració'
        : 'Maquinària')

  return {
    id: String(row.id || ''),
    kind,
    code: String(row.code || row.ticketCode || row.id || '').trim(),
    createdAt: String(row.createdAt || ''),
    location: String(row.location || ''),
    machine: String(row.machine || ''),
    status: String(row.status || ''),
    priority: String(row.priority || ''),
    category,
    assignees: String(row.assignees || '—'),
    workMinutes: Number(row.workMinutes) || 0,
    travelMinutes: Number(row.travelMinutes) || 0,
    totalMinutes: Number(row.totalMinutes) || 0,
    externalized: row.externalized,
  }
}

function normalizeMonthRow(row: MaintenanceMonthSeriesRow): MaintenanceMonthSeriesRow {
  return {
    ...row,
    tickets: Number(row.tickets) || 0,
    preventius: Number(row.preventius) || 0,
    workMinutes: Number(row.workMinutes) || 0,
    travelMinutes: Number(row.travelMinutes) || 0,
    totalMinutes: Number(row.totalMinutes) || 0,
  }
}

function normalizeLocationRow(row: MaintenanceLocationRow): MaintenanceLocationRow {
  return {
    ...row,
    tickets: Number(row.tickets) || 0,
    externalizedTickets: Number(row.externalizedTickets) || 0,
    preventius: Number(row.preventius) || 0,
    workMinutes: Number(row.workMinutes) || 0,
    travelMinutes: Number(row.travelMinutes) || 0,
    totalMinutes: Number(row.totalMinutes) || 0,
  }
}

function normalizeAssigneeRow(row: MaintenanceAssigneeRow): MaintenanceAssigneeRow {
  return {
    ...row,
    tickets: Number(row.tickets) || 0,
    externalizedTickets: Number(row.externalizedTickets) || 0,
    preventius: Number(row.preventius) || 0,
    workMinutes: Number(row.workMinutes) || 0,
    totalMinutes: Number(row.totalMinutes) || 0,
  }
}

/** Assegura `entries` i camps nous quan la resposta ve d’una versió anterior de l’API. */
export function normalizeMaintenanceOverview(
  data: MaintenanceOverview | null | undefined
): MaintenanceOverview | null {
  if (!data) return null

  const rawEntries = (data.entries ?? data.tickets ?? []) as LegacyRow[]
  const entries = rawEntries.map(normalizeEntry)

  return {
    ...data,
    entries,
    tickets: entries,
    kpis: Array.isArray(data.kpis) ? data.kpis : [],
    statusBuckets: Array.isArray(data.statusBuckets) ? data.statusBuckets : [],
    priorityBuckets: Array.isArray(data.priorityBuckets) ? data.priorityBuckets : [],
    monthlySeries: (data.monthlySeries || []).map(normalizeMonthRow),
    topLocations: (data.topLocations || []).map(normalizeLocationRow),
    topAssignees: (data.topAssignees || []).map(normalizeAssigneeRow),
    filterOptions: data.filterOptions ?? {
      statuses: [],
      priorities: [],
      locations: [],
      ticketTypes: [],
      interventionTypes: [],
      assignees: [],
    },
  }
}

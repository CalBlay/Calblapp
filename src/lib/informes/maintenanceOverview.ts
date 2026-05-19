export type MaintenanceReportContext =
  | {
      kind: 'rolling'
      days: number
    }
  | {
      kind: 'range'
      dateFrom: string
      dateTo: string
    }
  | {
      kind: 'custom'
      dateFrom: string
      dateTo: string
      status?: string
      priority?: string
      location?: string
      ticketType?: string
      assigneeId?: string
      operatorId?: string
    }

export type MaintenanceSelectOption = {
  value: string
  label: string
}

export type MaintenanceKpiCard = {
  label: string
  value: number
  hint?: string
}

export type MaintenanceStatusBucket = {
  label: string
  value: number
}

export type MaintenanceMonthSeriesRow = {
  month: string
  label: string
  tickets: number
  preventius: number
  workMinutes: number
  travelMinutes: number
  totalMinutes: number
}

export type MaintenanceLocationRow = {
  location: string
  tickets: number
  preventius: number
  workMinutes: number
  travelMinutes: number
  totalMinutes: number
}

export type MaintenanceAssigneeRow = {
  name: string
  tickets: number
  preventius: number
  workMinutes: number
  totalMinutes: number
}

export type MaintenanceWorkReportRow = {
  id: string
  kind: 'ticket' | 'preventiu'
  code: string
  createdAt: string
  location: string
  machine: string
  status: string
  priority: string
  category: string
  assignees: string
  workMinutes: number
  travelMinutes: number
  totalMinutes: number
  externalized?: boolean
}

/** @deprecated Usa `entries`; es manté per compatibilitat amb exportacions antigues. */
export type MaintenanceTicketReportRow = MaintenanceWorkReportRow & {
  ticketCode: string
  ticketType: string
}

export type MaintenanceOverview = {
  generatedAt: string
  reportContext: MaintenanceReportContext
  kpis: MaintenanceKpiCard[]
  statusBuckets: MaintenanceStatusBucket[]
  priorityBuckets: MaintenanceStatusBucket[]
  monthlySeries: MaintenanceMonthSeriesRow[]
  topLocations: MaintenanceLocationRow[]
  topAssignees: MaintenanceAssigneeRow[]
  entries: MaintenanceWorkReportRow[]
  /** Alias històric: només files de tipus ticket. */
  tickets: MaintenanceWorkReportRow[]
  filterOptions: {
    statuses: MaintenanceSelectOption[]
    priorities: MaintenanceSelectOption[]
    locations: MaintenanceSelectOption[]
    ticketTypes: MaintenanceSelectOption[]
    assignees: MaintenanceSelectOption[]
  }
}

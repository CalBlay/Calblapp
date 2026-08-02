export type EventsWorkersReportContext =
  | {
      kind: 'rolling'
      days: number
    }
  | {
      kind: 'range'
      dateFrom: string
      dateTo: string
    }

export type EventsWorkersKpi = {
  label: string
  value: string
  hint?: string
}

export type EventsWorkersInsightTone = 'neutral' | 'positive' | 'attention' | 'critical'

export type EventsWorkersInsight = {
  title: string
  description: string
  tone: EventsWorkersInsightTone
}

export type EventsWorkersDepartmentRow = {
  department: string
  workersCount: number
  servicesCount: number
  responsibleEventsCount: number
  plannedHours: number
  actualHours: number
  contractedRangeHours: number
  deviationHours: number
  overtimeHours: number
  noShowCount: number
  leftEarlyCount: number
}

export type EventsWorkersTrendPoint = {
  label: string
  plannedHours: number
  actualHours: number
  overtimeHours: number
  noShowCount: number
}

export type EventsWorkersWorkerRow = {
  workerName: string
  department: string
  roleMix: string
  servicesCount: number
  eventsCount: number
  responsibleEventsCount: number
  plannedHours: number
  actualHours: number
  contractedWeeklyHours: number
  contractedRangeHours: number
  deviationHours: number
  overtimeHours: number
  noShowCount: number
  leftEarlyCount: number
}

export type EventsWorkersEntryRow = {
  eventId: string
  eventCode: string
  eventName: string
  eventDate: string
  department: string
  location: string
  workerName: string
  role: string
  isResponsible: boolean
  plannedStartTime: string
  plannedEndTime: string
  realEndTime: string
  plannedHours: number
  actualHours: number
  noShow: boolean
  leftEarly: boolean
  notes: string
}

export type EventsWorkersFilterOptions = {
  departments: Array<{ value: string; label: string }>
  workers: Array<{ value: string; label: string }>
}

export type EventsWorkersOverview = {
  reportContext: EventsWorkersReportContext
  kpis: EventsWorkersKpi[]
  insights: EventsWorkersInsight[]
  departments: EventsWorkersDepartmentRow[]
  trend: EventsWorkersTrendPoint[]
  workers: EventsWorkersWorkerRow[]
  entries: EventsWorkersEntryRow[]
  filterOptions: EventsWorkersFilterOptions
}

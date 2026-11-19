export type PreparationReportDetail = {
  id: string
  department: string
  preparerId: string
  preparerName: string
  businessLine: string
  warehouseLabels: string[]
  eventCode: string
  eventName: string
  serviceName: string
  preparationDate: string
  preparationTime: string
  completedAt: number
  durationMinutes: number
}

export type PreparationReportSummary = {
  preparerId: string
  preparerName: string
  businessLine: string
  preparationCount: number
  totalMinutes: number
  totalHours: number
}

export type PreparationBusinessLineSummary = {
  businessLine: string
  preparationCount: number
  totalMinutes: number
  totalHours: number
  sharePct: number
}

export type PreparationsOverview = {
  period: { dateFrom: string; dateTo: string }
  department: string
  kpis: {
    totalMinutes: number
    totalHours: number
    preparationCount: number
    preparerCount: number
    averageMinutes: number
  }
  summary: PreparationReportSummary[]
  byBusinessLine: PreparationBusinessLineSummary[]
  details: PreparationReportDetail[]
  filterOptions: {
    departments: string[]
    preparers: Array<{ value: string; label: string }>
    businessLines: string[]
  }
}

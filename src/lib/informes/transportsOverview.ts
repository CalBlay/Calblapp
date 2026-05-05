export type TransportsReportContext =
  | {
      kind: 'year'
      year: number
    }
  | {
      kind: 'custom'
      year: number
      month?: string
      plate?: string
      conductor?: string
      vehicleType?: string
      eventQuery?: string
    }

export type TransportSelectOption = {
  value: string
  label: string
}

export type TransportKpiCard = {
  label: string
  value: number
  hint?: string
}

export type TransportMonthSeriesRow = {
  month: string
  label: string
  km: number
  assignments: number
}

export type TransportStatusBucket = {
  label: string
  value: number
}

export type TransportTopVehicleRow = {
  plate: string
  type: string
  assignments: number
  driverName?: string
}

export type TransportTopDriverRow = {
  name: string
  assignments: number
  vehicles: number
}

export type TransportCriticalVehicleRow = {
  id: string
  plate: string
  type: string
  driverName: string
  latestKm: number | null
  reviewStatus: string
  itvStatus: string
  availability: string
}

export type TransportAssignmentReportRow = {
  eventCode: string
  day: string
  month: string
  eventName: string
  location: string
  pax: number
  status: 'draft' | 'confirmed'
  department: string
  driverName: string
  plate: string
  vehicleType: string
  startTime: string
  arrivalTime: string
  endTime: string
}

export type TransportsOverview = {
  generatedAt: string
  reportContext: TransportsReportContext
  kpis: TransportKpiCard[]
  reviewBuckets: TransportStatusBucket[]
  itvBuckets: TransportStatusBucket[]
  monthlySeries: TransportMonthSeriesRow[]
  topVehicles: TransportTopVehicleRow[]
  topDrivers: TransportTopDriverRow[]
  criticalVehicles: TransportCriticalVehicleRow[]
  assignments: TransportAssignmentReportRow[]
  filterOptions: {
    months: TransportSelectOption[]
    vehicles: TransportSelectOption[]
    drivers: TransportSelectOption[]
    vehicleTypes: TransportSelectOption[]
  }
}

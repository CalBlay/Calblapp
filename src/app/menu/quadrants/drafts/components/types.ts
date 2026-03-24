// file: src/app/menu/quadrants/drafts/components/types.ts

export type Role = 'responsable' | 'conductor' | 'treballador' | 'brigada'

export type Row = {
  role: Role
  id: string
  name: string
  isDriver?: boolean
  groupId?: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  meetingPoint?: string
  arrivalTime?: string
  vehicleType?: string
  plate?: string
  workers?: number // només per brigades
}

// ✅ Input que arriba del backend per construir Drafts
export type DraftInput = {
  id: string
  code?: string
  eventName?: string
  location?: string | Record<string, unknown>
  department?: string
  startDate: string
  startTime?: string
  endDate?: string
  endTime?: string
  arrivalTime?: string | null
  meetingPoint?: string
  groups?: Array<{
    id?: string | null
    serviceDate?: string | null
    dateLabel?: string | null
    meetingPoint?: string
    startTime?: string
    arrivalTime?: string | null
    endTime?: string
    workers?: number
    drivers?: number
    needsDriver?: boolean
    driverId?: string | null
    driverName?: string | null
    responsibleId?: string | null
    responsibleName?: string | null
  }>
  responsablesNeeded?: number
  numDrivers?: number
  totalWorkers?: number
  status?: string
  responsableId?: string
  responsableName?: string | Record<string, unknown>
  responsable?: Partial<Row> | null
  conductors?: Array<Partial<Row>>
  treballadors?: Array<Partial<Row>>
  brigades?: Array<Partial<Row>> // afegit per coherència amb DraftsTable
  timetables?: Array<{ startTime: string; endTime: string }>
}

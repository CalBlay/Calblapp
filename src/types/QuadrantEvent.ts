// src/types/QuadrantEvent.ts
export interface QuadrantEvent {
  id: string
  summary: string
  title?: string
  start: string
  end: string
  originalStart?: string
  originalEnd?: string
  day?: string
  horaInici?: string
  location?: string | null
  eventLocation?: string | null
  meetingPoint?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string | null
  department?: string
  totalWorkers?: number
  numDrivers?: number
  state?: 'pending' | 'draft' | 'confirmed'
  eventCode?: string
  responsable?: string | null
  conductors?: Array<string | { id?: string; name?: string }>
  treballadors?: Array<string | { id?: string; name?: string }>
  code?: string
  service?: string | null
  numPax?: number | null
  commercial?: string | null
  phaseKey?: string
  phaseLabel?: string
  phaseType?: string
}

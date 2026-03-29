export type LogisticPhaseKey = 'entrega' | 'event' | 'recollida'

export const logisticPhaseOptions: Array<{ key: LogisticPhaseKey; label: string }> = [
  { key: 'entrega', label: 'Entrega' },
  { key: 'event', label: 'Event' },
  { key: 'recollida', label: 'Recollida' },
]

export type ServicePhaseKey = 'muntatge' | 'event'

export const servicePhaseOptions: Array<{ key: ServicePhaseKey; label: string }> = [
  { key: 'muntatge', label: 'Muntatge' },
  { key: 'event', label: 'Event' },
]

export type LogisticPhaseForm = {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  workers: number
  drivers: number
  meetingPoint: string
}

export type LogisticPhaseSetting = {
  selected: boolean
  needsResponsible: boolean
}

export type ServicePhaseSetting = {
  selected: boolean
  needsResponsible: boolean
}

export type VehicleAssignment = {
  vehicleType: string
  vehicleId: string
  plate: string
  conductorId?: string | null
  arrivalTime?: string
}

export type AvailableConductor = {
  id: string
  name: string
  isDriver?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

export type AvailableVehicle = {
  id: string
  plate?: string
  type?: string
  available: boolean
  conductorId?: string | null
}

export type ServeiGroup = {
  id: string
  serviceDate: string
  dateLabel: string
  meetingPoint: string
  startTime: string
  endTime: string
  workers: number
  responsibleId: string
  phaseKey: ServicePhaseKey
  needsDriver: boolean
  driverId: string
}

export type ServicePhaseEttData = {
  serviceDate: string
  meetingPoint: string
  startTime: string
  endTime: string
  workers: string
}

export type ServicePhaseEtt = {
  open: boolean
  data: ServicePhaseEttData
}

export type LogisticPhaseKey = 'entrega' | 'event' | 'recollida'

/** Ordre de pintat / payload: Event primer (fase principal), després Entrega i Recollida. */
export const logisticPhaseOptions: Array<{ key: LogisticPhaseKey; label: string }> = [
  { key: 'event', label: 'Event' },
  { key: 'entrega', label: 'Entrega' },
  { key: 'recollida', label: 'Recollida' },
]

export type ServicePhaseKey = 'muntatge' | 'event'

/** Ordre de pintat / payload: Event primer (fase principal), després Muntatge. */
export const servicePhaseOptions: Array<{ key: ServicePhaseKey; label: string }> = [
  { key: 'event', label: 'Event' },
  { key: 'muntatge', label: 'Muntatge' },
]

export type ServeiRoleKey = 'responsable' | 'conductor' | 'treballador' | 'jamonero'

export type ServeiGroupRoleLine = {
  slotId: string
  role: ServeiRoleKey
  personId: string
  personName?: string
  serviceDate?: string
  meetingPoint?: string
  startTime?: string
  endTime?: string
  /** Hora d'arribada a l'esdeveniment (logística). */
  arrivalTime?: string
  /** Treballador extern (ETT, extra centre, etc.). */
  isExternal?: boolean
  externalType?: 'ett' | 'centerExternalExtra'
  isCenterExternalExtra?: boolean
}

export type LogisticPhaseForm = {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  /** Hora d'arribada per defecte de la fase (capçalera / Aplicar tot). */
  arrivalTime?: string
  workers: number
  drivers: number
  meetingPoint: string
  /** Línies de treballadors (UI alineada amb Serveis). */
  roleLines?: ServeiGroupRoleLine[]
  /** Mode manual: slots de treballadors (parity Serveis/Cuina). */
  workerIds?: string[]
  workerDetails?: Record<
    string,
    {
      id: string
      name?: string
      serviceDate?: string
      meetingPoint?: string
      startTime?: string
      endTime?: string
      arrivalTime?: string
    }
  >
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
  /** Vincle amb la línia de rol (conductor) a la UI. */
  slotId?: string
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
  /** Línies d'assignació per rol (responsable, conductor, treballador, jamonero). */
  roleLines?: ServeiGroupRoleLine[]
  /** Mode manual: IDs de treballadors triats explícitament. */
  workerIds?: string[]
  /**
   * Mode manual: detalls per treballador (override del grup).
   * Si falta algun camp, s'interpreta que hereta del grup.
   */
  workerDetails?: Record<
    string,
    {
      id: string
      name?: string
      serviceDate?: string
      meetingPoint?: string
      startTime?: string
      endTime?: string
    }
  >
  jamoneros: number
  wantsResponsible: boolean
  responsibleId: string
  phaseKey: ServicePhaseKey
  needsDriver: boolean
  driverId: string
}

export type ServiceJamoneroAssignment = {
  id: string
  mode: 'auto' | 'manual'
  personnelId: string
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

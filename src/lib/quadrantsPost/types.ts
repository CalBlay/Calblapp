export interface CuinaGroup {
  meetingPoint: string
  startTime: string
  arrivalTime?: string | null
  endTime: string
  workers: number
  drivers: number
  needsDriver?: boolean
  wantsResponsible?: boolean
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

export interface QuadrantSave {
  code: string
  eventId: string
  eventName: string
  location: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  department: string
  status: string
  numDrivers: number
  totalWorkers: number
  numPax?: number | null
  responsableName: string | null
  responsableId?: string | null
  responsable: { id?: string; name: string; meetingPoint: string } | null
  conductors: Array<{ name: string; meetingPoint: string; plate: string; vehicleType: string }>
  treballadors: Array<{
    name: string
    meetingPoint: string
    startDate?: string
    endDate?: string
    startTime?: string
    endTime?: string
    arrivalTime?: string | null
    isExternal?: boolean
  }>
  needsReview: boolean
  violations: string[]
  attentionNotes: string[]
  updatedAt: string
  legacyBrigades?: Array<Record<string, unknown>>
  groups?: Array<{
    id?: string | null
    serviceDate?: string | null
    dateLabel?: string | null
    meetingPoint: string
    startTime: string
    arrivalTime?: string | null
    endTime: string
    workers: number
    jamoneros?: number
    drivers: number
    needsDriver?: boolean
    wantsResponsible?: boolean
    driverId?: string | null
    driverName?: string | null
    responsibleId?: string | null
    responsibleName?: string | null
  }>
  cuinaGroupCount?: number
  service?: string | null
  arrivalTime?: string | null
  distanceKm?: number | null
  distanceCalcAt?: string | null
  timetables?: Array<{ startTime: string; endTime: string }>
  ln?: string | null
  phaseType?: string | null
  phaseLabel?: string | null
  phaseDate?: string | null
  /** Model de vestimenta triat en crear el quadrant (Serveis). */
  vestimentModel?: string | null
  /**
   * Snapshot de l'assignació vigent al desament (auto, semi o manual).
   * Serveix per calcular diff en confirmar i per mostres d'entrenament (ML).
   */
  autoProposal?: {
    createdAt: string
    /** Com s'ha generat la fila desada: auto | semi | manual */
    generationMode?: 'auto' | 'semi' | 'manual'
    responsibleName: string | null
    driverNames: string[]
    staffNames: string[]
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
}

export type ServeisGroupInput = Record<string, unknown> & {
  wantsResponsible?: boolean
  id?: string | null
  serviceDate?: string | null
  dateLabel?: string | null
  meetingPoint?: string
  startTime?: string
  endTime?: string
  workers?: number | string
  jamoneros?: number | string
  drivers?: number | string
  needsDriver?: boolean
  driverId?: string | null
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
  manualWorkers?: unknown
}

export type ExternalWorkerInput = {
  name?: string
  meetingPoint?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string | null
  isExternal?: boolean
}

export type InternalWorkerLine = {
  name: string
  meetingPoint: string
  isJamonero?: boolean
}

export type ExternalWorkerLine = {
  name: string
  meetingPoint: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string | null
  isExternal?: boolean
}

/** Subset of POST body fields consumed by `buildQuadrantSave` */
export type QuadrantSaveRequestBody = {
  code?: string
  eventId?: string
  eventName?: string
  location?: string
  meetingPoint?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  arrivalTime?: string | null
  numDrivers?: number | string
  totalWorkers?: number | string
  numPax?: number | null
  service?: string | null
  ln?: string | null
  phaseType?: string | null
  phaseLabel?: string | null
  phaseDate?: string | null
  manualResponsibleId?: string | null
  manualResponsibleName?: string
  externalWorkers?: ExternalWorkerInput[]
  timetables?: Array<{ startTime?: unknown; endTime?: unknown }>
  vestimentModel?: unknown
  groups?: ServeisGroupInput[]
  jamoneroCount?: number | string
  cuinaGroupCount?: number | string
  mode?: 'auto' | 'semi' | 'manual'
  manualAssignment?: {
    responsibleName?: string | null
    driverNames?: string[]
    staffNames?: string[]
  }
}

export type JamoneroAssignmentRaw = {
  id?: string
  mode?: string
  personnelId?: string
  personnelName?: string
}

export type JamoneroAssignmentNormalized = {
  id: string
  mode: 'manual' | 'auto'
  personnelId: string | null
  personnelName: string | null
}

export type SurveyPreferenceAugmentation = {
  preferredStaffNames: string[]
  preferredDriverNames: string[]
  preferredResponsibleName: string | null
}

export type PhaseRequest = Record<string, unknown> & {
  groupId?: string | null
  label?: string
  phaseType?: string
  date?: string
  endDate?: string
  startTime?: string
  endTime?: string
  totalWorkers?: number
  jamoneroCount?: number
  numDrivers?: number
  wantsResp?: boolean
  responsableId?: string | null
  manualDriverId?: string | null
  meetingPoint?: string
  vehicles?: unknown[]
  groupsOverride?: ServeisGroupInput[]
  serviceJamoneroAssignmentsOverride?: JamoneroAssignmentNormalized[]
  partitionedServiceJamoneros?: JamoneroAssignmentNormalized[]
  timetables?: unknown
}

export type PreferredPhaseResult = {
  assignment: {
    responsible: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: {
    needsReview: boolean
    violations: string[]
    notes: string[]
  }
}

export type SingleFlowAssignResult = {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: {
    needsReview: boolean
    violations: string[]
    notes: string[]
  }
}

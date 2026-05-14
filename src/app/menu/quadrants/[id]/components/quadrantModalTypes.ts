import type { QuadrantEvent } from '@/types/QuadrantEvent'

export type QuadrantModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: QuadrantEvent
  /** Després de desar correctament: refrescar llista de quadrants abans de tancar (punt blau / comptadors). */
  onSaved?: () => Promise<void>
}

export type CuinaDriverAssignment = {
  vehicleType: string
  driverMode: string
}

export type CuinaGroup = {
  id: string
  meetingPoint: string
  startTime: string
  arrivalTime: string
  endTime: string
  workers: number
  drivers: number
  needsDriver: boolean
  wantsResponsible: boolean
  responsibleId: string
  driverMode: string
  vehicleType: string
  driverAssignments?: CuinaDriverAssignment[]
  /** Mode manual: igual que Serveis - IDs de slots de treballadors */
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
    }
  >
}

export type TimetableEntry = {
  startTime?: string
  endTime?: string
}

export type GenerationScope = 'day' | 'event'
export type QuadrantMode = 'auto' | 'semi' | 'manual'

export type SessionUserInfo = {
  role?: string
  department?: string
  dept?: string
}

export type GroupPayload = Record<string, unknown> & {
  serviceDate?: string
}

export type ExternalWorkerPayload = {
  name?: string
  isExternal?: boolean
  meetingPoint?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
}

export type SurveyPersonApi = {
  id?: unknown
  name?: unknown
}

export type PremisesResponse = {
  premises?: {
    surveyGroups?: Array<{ id: string; name: string; workerIds: string[] }>
    vestimentModels?: string[]
  }
}

export type LearningStatus = {
  hasEnoughData?: boolean
  hasNameSuggestions?: boolean
  confidence?: 'insufficient' | 'low' | 'medium' | 'high'
  sampleCount?: number
  similarSampleCount?: number
  totalSamplesInDept?: number
  recommendation?: 'use_auto' | 'consider_semi' | 'use_semi_or_manual'
  reason?: string
}

export type SubmitQuadrantResponse = {
  ok?: boolean
  success?: boolean
  error?: string
  docIds?: string[]
  /** True quan el POST ha confirmat al mateix desament (manual Serveis/Cuina/Logística + confirmImmediately). */
  confirmInlineApplied?: boolean
  proposal?: {
    responsible?: { name?: string | null } | null
    drivers?: Array<{ name?: string | null }>
    staff?: Array<{ name?: string | null }>
  }
  meta?: {
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
  /** Resultat del motor d'aprenentatge en mode auto (null si no s'ha pogut calcular). */
  learningStatus?: LearningStatus | null
}

export type AutoPreviewResponse = {
  ok: boolean
  error?: string
  learningStatus: LearningStatus | null
  proposal: {
    responsible: { id: string; name: string; available: boolean } | null
    drivers: Array<{ id: string; name: string; available: boolean }>
    staff: Array<{ id: string; name: string; available: boolean }>
    totalWorkers: number | null
    numDrivers: number | null
  } | null
}

export type SurveySummary = {
  id: string
  serviceDate: string
  status: string
  createdByName?: string
  deadlineAt?: number
  targetGroupNames?: string[]
  targetWorkerNames?: string[]
  resolvedTargets?: Array<{ name: string }>
  counts?: { yes: number; no: number; maybe: number; pending: number; withoutAnswer?: number }
  responses?: Array<{
    workerName: string
    response: 'yes' | 'no' | 'maybe'
    respondedAt: number
  }>
  responseGroups?: {
    yes: Array<{ workerName: string; respondedAt: number }>
    maybe: Array<{ workerName: string; respondedAt: number }>
    no: Array<{ workerName: string; respondedAt: number }>
    pending: Array<{ workerName: string }>
    withoutAnswer?: Array<{ workerName: string }>
  }
}

export type SurveyGroupOption = { id: string; name: string; workerIds: string[] }
export type SurveyPersonOption = { id: string; name: string }

export type CuinaEttState = {
  open: boolean
  data: {
    serviceDate: string
    meetingPoint: string
    startTime: string
    endTime: string
    workers: string
  }
}

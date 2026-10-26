import type { QuadrantEvent } from '@/types/QuadrantEvent'

export type QuadrantStatus = 'pending' | 'draft' | 'confirmed'

export interface UnifiedEvent extends QuadrantEvent {
  id: string
  eventId?: string
  summary: string
  start: string
  end: string
  code?: string
  location?: string | null
  ln?: string | null
  responsable?: string | null
  commercial?: string | null
  numPax?: number | null
  hasDocuments?: boolean
  sourceEventIds?: string[]
  sourceEvents?: Array<{ id: string; name: string; code: string }>
  workersSummary?: string
  displayStartTime?: string | null
  displayEndTime?: string | null
  quadrantStatus?: QuadrantStatus
  draft?: unknown
  horariLabel?: string
  phaseType?: string
  phaseLabel?: string
  phaseBadgeLabel?: string
  eventDateLabel?: string
  eventDateRaw?: string
  phaseKey?: string
  phaseDate?: string
}

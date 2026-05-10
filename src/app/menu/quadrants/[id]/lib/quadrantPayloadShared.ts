import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type {
  ExternalWorkerPayload,
  QuadrantMode,
  TimetableEntry,
} from '../components/quadrantModalTypes'
import { collectTimetable, splitTitle } from '../components/quadrantModalUtils'

export type IdName = { id: string; name?: string }

export type BasePayloadInput = {
  event: QuadrantEvent
  department: string
  location: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  arrivalTime: string
  manualResponsibleId: string | null
  manualResponsibleName: string | null
  mode: QuadrantMode
}

/**
 * Construeix la part comuna del payload (camps presents per qualsevol departament).
 */
export function buildBasePayload({
  event,
  department,
  location,
  meetingPoint,
  startDate,
  startTime,
  endDate,
  endTime,
  arrivalTime,
  manualResponsibleId,
  manualResponsibleName,
  mode,
}: BasePayloadInput): Record<string, unknown> {
  const title = event.summary || event.title || ''
  return {
    eventId: event.id,
    code: splitTitle(title).code || '',
    eventName: splitTitle(title).name,
    department,
    location,
    meetingPoint,
    startDate,
    startTime,
    endDate,
    endTime,
    arrivalTime: arrivalTime || null,
    manualResponsibleId,
    manualResponsibleName,
    service: event.service || null,
    numPax: event.numPax ?? null,
    commercial: event.commercial ?? null,
    mode,
  }
}

/**
 * Resol el responsable manual a {id, name} a partir del valor del select i la llista de candidats.
 */
export function resolveManualResponsible(
  manualResp: string,
  availableResponsables: IdName[]
): { id: string | null; name: string | null } {
  const id = manualResp && manualResp !== '__auto__' ? manualResp : null
  const name = id ? availableResponsables.find((resp) => resp.id === id)?.name ?? null : null
  return { id, name }
}

/**
 * Acumulador de timetables. Retorna l'array i una funció `add` per registrar entrades vàlides.
 */
export function createTimetableCollector(): {
  timetables: TimetableEntry[]
  add: (entry: TimetableEntry) => void
} {
  const timetables: TimetableEntry[] = []
  return {
    timetables,
    add: (entry) => {
      const tt = collectTimetable(entry)
      if (tt) timetables.push(tt)
    },
  }
}

export type ExternalWorker = {
  name: string
  isExternal: boolean
  meetingPoint: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
}

/**
 * Construeix N entrades d'ETT (treballadors externs) a partir d'una configuració base.
 */
export function buildEttEntries(
  workers: number,
  base: Omit<ExternalWorker, 'name' | 'isExternal'>
): ExternalWorker[] {
  if (!workers || workers <= 0) return []
  return Array.from({ length: workers }, () => ({
    name: 'ETT',
    isExternal: true,
    ...base,
  }))
}

/**
 * Concatena `extra` als externalWorkers ja presents al payload.
 */
export function appendExternalWorkers(
  payload: Record<string, unknown>,
  extra: ExternalWorker[]
): void {
  if (!extra.length) return
  const existing = Array.isArray(payload.externalWorkers)
    ? (payload.externalWorkers as ExternalWorkerPayload[])
    : []
  payload.externalWorkers = [...existing, ...extra]
}

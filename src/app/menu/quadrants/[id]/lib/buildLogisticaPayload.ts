import type { TimetableEntry } from '../components/quadrantModalTypes'
import type { EttEntry, LogisticPhasePayload } from '../hooks/useQuadrantFormState'
import {
  appendExternalWorkers,
  buildEttEntries,
  createTimetableCollector,
} from './quadrantPayloadShared'

export type BuildLogisticaPayloadInput = {
  basePayload: Record<string, unknown>
  totalWorkers: string | number
  numDrivers: string | number
  buildLogisticaPhases: () => LogisticPhasePayload[]
  ettEntry: EttEntry | null
}

export type BuiltPayload = {
  payload: Record<string, unknown>
  timetables: TimetableEntry[]
}

/**
 * Construeix el payload sencer per al departament de Logística: fases + entrada ETT global.
 * Important: a diferència de Cuina/Serveis, Logística NO desa l'array `timetables` al payload
 * (cada fase ja porta les seves) — l'acumulador es manté pel principi DRY però el caller pot
 * decidir si l'aplica o no.
 */
export function buildLogisticaPayload(input: BuildLogisticaPayloadInput): BuiltPayload {
  const { basePayload, totalWorkers, numDrivers, buildLogisticaPhases, ettEntry } = input

  const payload: Record<string, unknown> = {
    ...basePayload,
    totalWorkers: Number(totalWorkers) || 0,
    numDrivers: Number(numDrivers) || 0,
    logisticaPhases: buildLogisticaPhases(),
  }

  const { timetables, add: addTimetable } = createTimetableCollector()
  ;(payload.logisticaPhases as LogisticPhasePayload[]).forEach((phase) =>
    phase.timetables?.forEach((tt) => addTimetable(tt))
  )

  if (ettEntry) {
    const entries = buildEttEntries(Number(ettEntry.workers || 0), {
      meetingPoint: ettEntry.meetingPoint,
      startDate: ettEntry.startDate,
      endDate: ettEntry.endDate,
      startTime: ettEntry.startTime,
      endTime: ettEntry.endTime,
    })
    appendExternalWorkers(payload, entries)
    addTimetable({ startTime: ettEntry.startTime, endTime: ettEntry.endTime })
  }

  return { payload, timetables }
}

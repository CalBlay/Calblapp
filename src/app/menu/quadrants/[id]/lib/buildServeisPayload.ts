import type { TimetableEntry } from '../components/quadrantModalTypes'
import type { ServiceGroupPayload } from '../hooks/useQuadrantFormState'
import type {
  ServiceJamoneroAssignment,
  ServicePhaseEtt,
  ServicePhaseKey,
} from '../phaseConfig'
import {
  appendExternalWorkers,
  buildEttEntries,
  createTimetableCollector,
  type IdName,
} from './quadrantPayloadShared'

export type BuildServeisPayloadInput = {
  basePayload: Record<string, unknown>
  buildServiceGroupsPayload: (
    manualResponsibleId: string | null,
    manualResponsibleName?: string | null
  ) => ServiceGroupPayload[]
  serviceTotals: { workers: number; drivers: number; responsables: number; jamoneros: number }
  serviceJamoneroAssignments: ServiceJamoneroAssignment[]
  servicePhaseEtt: Record<ServicePhaseKey, ServicePhaseEtt>
  vestimentModelChoice: string
  manualResponsibleId: string | null
  manualResponsibleName: string | null
  meetingPoint: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  availableConductors: IdName[]
  availableJamoneros: IdName[]
}

export type BuiltPayload = {
  payload: Record<string, unknown>
  timetables: TimetableEntry[]
}

/**
 * Construeix el payload sencer per al departament de Serveis: grups, jamoneros, vestimenta i ETT per fase.
 */
export function buildServeisPayload(input: BuildServeisPayloadInput): BuiltPayload {
  const {
    basePayload,
    buildServiceGroupsPayload,
    serviceTotals,
    serviceJamoneroAssignments,
    servicePhaseEtt,
    vestimentModelChoice,
    manualResponsibleId,
    manualResponsibleName,
    meetingPoint,
    startDate,
    endDate,
    startTime,
    endTime,
    availableConductors,
    availableJamoneros,
  } = input

  const payload = { ...basePayload }
  const { timetables, add: addTimetable } = createTimetableCollector()

  const groupsPayload = buildServiceGroupsPayload(
    manualResponsibleId,
    manualResponsibleName
  ).map((group) => ({
    ...group,
    driverName: group.driverId
      ? availableConductors.find((conductor) => conductor.id === group.driverId)?.name || null
      : null,
  }))

  payload.groups = groupsPayload
  payload.totalWorkers = serviceTotals.workers
  payload.numDrivers = serviceTotals.drivers
  payload.jamoneroCount = serviceTotals.jamoneros
  payload.serviceJamoneroAssignments = serviceJamoneroAssignments
    .filter((assignment) => assignment.mode === 'manual' && assignment.personnelId)
    .map((assignment) => ({
    id: assignment.id,
    mode: assignment.mode,
    personnelId:
      assignment.mode === 'manual' && assignment.personnelId ? assignment.personnelId : null,
    personnelName:
      assignment.mode === 'manual' && assignment.personnelId
        ? availableJamoneros.find((person) => person.id === assignment.personnelId)?.name || null
        : null,
  }))
  groupsPayload.forEach((group) => addTimetable(group))
  payload.vestimentModel =
    vestimentModelChoice !== '__none__' ? vestimentModelChoice.trim() : null

  // ETT per cada fase de Serveis
  Object.entries(servicePhaseEtt).forEach(([phaseKey, ettState]) => {
    ettState.groups.forEach((ettGroup) => {
      const workers = Number(ettGroup.data.workers || 0)
      if (!workers) return
      const phaseGroupPrefix = `serveis-${phaseKey}-`
      const ettGroupKey = ettGroup.id.startsWith(phaseGroupPrefix)
        ? ettGroup.id
        : `${phaseGroupPrefix}${ettGroup.id}`
      const entries = buildEttEntries(workers, {
        meetingPoint: ettGroup.data.meetingPoint || meetingPoint,
        startDate: ettGroup.data.serviceDate || startDate,
        endDate: ettGroup.data.serviceDate || endDate,
        startTime: ettGroup.data.startTime || startTime,
        endTime: ettGroup.data.endTime || endTime,
        ettProviderId: ettGroup.data.ettProviderId,
        ettProviderName: ettGroup.data.ettProviderName,
        ettResponsibleName: ettGroup.data.ettResponsibleName,
        ettEmail: ettGroup.data.ettEmail,
        ettGroupKey,
      })
      appendExternalWorkers(payload, entries)
      entries.forEach((entry) =>
        addTimetable({ startTime: entry.startTime, endTime: entry.endTime })
      )
    })
  })

  return { payload, timetables }
}

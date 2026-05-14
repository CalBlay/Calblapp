import type {
  CuinaEttState,
  CuinaGroup,
  QuadrantMode,
  TimetableEntry,
} from '../components/quadrantModalTypes'
import {
  appendExternalWorkers,
  buildEttEntries,
  createTimetableCollector,
  type IdName,
} from './quadrantPayloadShared'

type CuinaVehicle = {
  id: string
  plate: string
  vehicleType: string
  conductorId: string | null
  arrivalTime: string
}

export type BuildCuinaPayloadInput = {
  basePayload: Record<string, unknown>
  mode: QuadrantMode
  cuinaGroups: CuinaGroup[]
  cuinaTotals: { workers: number; drivers: number; responsables: number }
  cuinaVehiclesPayload: CuinaVehicle[]
  cuinaEtt: CuinaEttState
  isManualResponsibleConductor: boolean
  manualResponsibleId: string | null
  manualResponsibleName: string | null
  meetingPoint: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  availableResponsables: IdName[]
  availableConductors: IdName[]
}

export type BuiltPayload = {
  payload: Record<string, unknown>
  timetables: TimetableEntry[]
}

/**
 * Construeix el payload sencer per al departament de Cuina, incloent grups, vehicles
 * i les entrades d'ETT extretes de l'estat lateral.
 */
export function buildCuinaPayload(input: BuildCuinaPayloadInput): BuiltPayload {
  const {
    basePayload,
    mode,
    cuinaGroups,
    cuinaTotals,
    cuinaVehiclesPayload,
    cuinaEtt,
    isManualResponsibleConductor,
    manualResponsibleId,
    manualResponsibleName,
    meetingPoint,
    startDate,
    endDate,
    startTime,
    endTime,
    availableResponsables,
    availableConductors,
  } = input

  const payload = { ...basePayload }
  const { timetables, add: addTimetable } = createTimetableCollector()

  const singleGroup = cuinaGroups.length === 1
  const groupsPayload = cuinaGroups.map((group) => {
    const driverAssignments = Array.isArray(group.driverAssignments)
      ? group.driverAssignments
      : []
    const selectedRespId = group.wantsResponsible
      ? group.responsibleId || manualResponsibleId || ''
      : ''
    const selected = availableResponsables.find((r) => r.id === selectedRespId)
    const primaryAssignment = driverAssignments[0] || null
    const selectedDriverId =
      primaryAssignment?.driverMode === '__responsable__'
        ? selectedRespId || manualResponsibleId || ''
        : primaryAssignment?.driverMode && primaryAssignment.driverMode !== '__auto__'
        ? primaryAssignment.driverMode
        : ''
    const selectedDriver =
      selectedDriverId && selectedDriverId !== '__auto__'
        ? availableConductors.find((conductor) => conductor.id === selectedDriverId) || null
        : null
    const resolvedWorkerIds = Array.isArray(group.workerIds)
      ? group.workerIds.filter(Boolean)
      : []
    const resolvedWorkerDetails = group.workerDetails || {}
    const manualWorkers =
      mode === 'manual' && resolvedWorkerIds.length > 0
        ? resolvedWorkerIds.map((id) => {
            const d = resolvedWorkerDetails[id] || { id }
            return {
              id,
              name: d.name,
              serviceDate: d.serviceDate || startDate,
              meetingPoint: d.meetingPoint || group.meetingPoint || meetingPoint,
              startTime: d.startTime || group.startTime,
              endTime: d.endTime || group.endTime,
            }
          })
        : null
    const responsibleActsAsDriver =
      primaryAssignment?.driverMode === '__responsable__' &&
      Number(group.drivers || 0) > 0 &&
      isManualResponsibleConductor
    return {
      meetingPoint: group.meetingPoint || meetingPoint || '',
      startTime: group.startTime,
      arrivalTime: group.arrivalTime || null,
      endTime: group.endTime,
      workers: group.workers,
      drivers: Math.max(0, Number(group.drivers || 0)),
      needsDriver: Number(group.drivers || 0) > 0,
      wantsResponsible: group.wantsResponsible,
      responsibleId: selectedRespId && selectedRespId !== '__auto__' ? selectedRespId : null,
      responsibleName: group.wantsResponsible ? selected?.name || null : null,
      driverName:
        selectedDriver?.name ||
        (singleGroup && responsibleActsAsDriver ? manualResponsibleName || null : null),
      driverId: selectedDriverId && selectedDriverId !== '__auto__' ? selectedDriverId : null,
      ...(manualWorkers ? { manualWorkers } : {}),
    }
  })

  payload.groups = groupsPayload
  payload.totalWorkers = cuinaTotals.workers
  payload.numDrivers = cuinaTotals.drivers
  payload.cuinaGroupCount = cuinaGroups.length
  payload.vehicles = cuinaVehiclesPayload
  groupsPayload.forEach((group) => addTimetable(group))

  // ETT lateral (panell ETT del cuinat)
  const ettWorkers = Number(cuinaEtt.data.workers || 0)
  if (ettWorkers > 0) {
    const entries = buildEttEntries(ettWorkers, {
      meetingPoint: cuinaEtt.data.meetingPoint || meetingPoint,
      startDate: cuinaEtt.data.serviceDate || startDate,
      endDate: cuinaEtt.data.serviceDate || endDate,
      startTime: cuinaEtt.data.startTime || startTime,
      endTime: cuinaEtt.data.endTime || endTime,
    })
    appendExternalWorkers(payload, entries)
    entries.forEach((entry) =>
      addTimetable({ startTime: entry.startTime, endTime: entry.endTime })
    )
  }

  return { payload, timetables }
}

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
import { ensureCuinaRoleLines, isCuinaCenterExternalExtraLine, type CuinaStaffTotals } from './cuinaGroupRoleLines'
import {
  getExternalWorkerTypeFromName,
  normalizeExternalWorkerName,
} from '@/lib/quadrantExternalWorkers'

type CuinaVehicle = {
  id: string
  plate: string
  vehicleType: string
  conductorId: string | null
  arrivalTime: string
}

const resolveGroupDriverId = (
  group: CuinaGroup,
  manualResponsibleId: string | null
): string => {
  const conductorLine = (group.roleLines || []).find((line) => line.role === 'conductor')
  const fromRoleLine = String(conductorLine?.personId || '').trim()
  if (fromRoleLine) return fromRoleLine

  const driverAssignments = Array.isArray(group.driverAssignments) ? group.driverAssignments : []
  const primaryAssignment = driverAssignments[0]
  const selectedRespId = group.wantsResponsible
    ? group.responsibleId || manualResponsibleId || ''
    : ''

  if (primaryAssignment?.driverMode === '__responsable__') {
    return selectedRespId || manualResponsibleId || ''
  }
  if (primaryAssignment?.driverMode && primaryAssignment.driverMode !== '__auto__') {
    return primaryAssignment.driverMode
  }
  return ''
}

export type BuildCuinaPayloadInput = {
  basePayload: Record<string, unknown>
  mode: QuadrantMode
  cuinaGroups: CuinaGroup[]
  cuinaTotals: CuinaStaffTotals
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
    const selectedDriverId = resolveGroupDriverId(group, manualResponsibleId)
    const selectedDriver =
      selectedDriverId && selectedDriverId !== '__auto__'
        ? availableConductors.find((conductor) => conductor.id === selectedDriverId) || null
        : null
    const roleLines = ensureCuinaRoleLines(group)
    const workerLines = roleLines.filter((line) => line.role === 'treballador')
    const filledWorkerLines = workerLines.filter((line) =>
      Boolean(String(line.personId || line.personName || '').trim())
    )
    const manualWorkers =
      mode === 'manual' && filledWorkerLines.length > 0
        ? filledWorkerLines
            .filter((line) => !isCuinaCenterExternalExtraLine(line))
            .map((line) => ({
            id: String(line.personId || '').trim(),
            name: line.personName,
            serviceDate: line.serviceDate || group.serviceDate || startDate,
            meetingPoint: line.meetingPoint || group.meetingPoint || meetingPoint,
            startTime: line.startTime || group.startTime,
            endTime: line.endTime || group.endTime,
            arrivalTime: line.arrivalTime || group.arrivalTime || null,
          }))
        : null
    const manualWorkersOrNull =
      manualWorkers && manualWorkers.length > 0 ? manualWorkers : null
    const resolvedWorkerIds = Array.isArray(group.workerIds)
      ? group.workerIds.filter(Boolean)
      : []
    const resolvedWorkerDetails = group.workerDetails || {}
    void resolvedWorkerIds
    void resolvedWorkerDetails
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
      ...(manualWorkersOrNull ? { manualWorkers: manualWorkersOrNull } : {}),
    }
  })

  payload.groups = groupsPayload
  const ettPanelWorkers = Number(cuinaEtt.data.workers || 0)
  payload.totalWorkers = cuinaTotals.headcount + ettPanelWorkers
  payload.numDrivers = cuinaTotals.drivers
  payload.cuinaGroupCount = cuinaGroups.length
  payload.vehicles = cuinaVehiclesPayload
  groupsPayload.forEach((group) => addTimetable(group))

  const centerExternalExtras = cuinaGroups.flatMap((group) =>
    ensureCuinaRoleLines(group)
      .filter((line) => line.role === 'treballador')
      .filter(
        (line) =>
          line.isCenterExternalExtra === true ||
          line.externalType === 'centerExternalExtra' ||
          getExternalWorkerTypeFromName(line.personName) === 'centerExternalExtra'
      )
      .map((line) => ({
        name: normalizeExternalWorkerName({
          rawName: line.personName,
          type: 'centerExternalExtra',
        }),
        isExternal: true,
        meetingPoint: line.meetingPoint || group.meetingPoint || meetingPoint,
        startDate: line.serviceDate || group.serviceDate || startDate,
        endDate: line.serviceDate || group.serviceDate || endDate,
        startTime: line.startTime || group.startTime || startTime,
        endTime: line.endTime || group.endTime || endTime,
      }))
  )
  if (centerExternalExtras.length > 0) {
    appendExternalWorkers(payload, centerExternalExtras)
    centerExternalExtras.forEach((entry) =>
      addTimetable({ startTime: entry.startTime, endTime: entry.endTime })
    )
  }

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

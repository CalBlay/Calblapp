import type { CuinaGroup } from '../components/quadrantModalTypes'
import type { ServeiGroupRoleLine, ServeiRoleKey, VehicleAssignment } from '../phaseConfig'
import {
  getExternalWorkerBaseLabel,
  getExternalWorkerTypeFromName,
} from '@/lib/quadrantExternalWorkers'

const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

export const cuinaWorkerLineKey = (line: ServeiGroupRoleLine) => {
  const personId = String(line.personId || '').trim()
  if (personId) return personId
  return `__slot__:${line.slotId}`
}

export function isCuinaCenterExternalExtraLine(line: ServeiGroupRoleLine): boolean {
  return (
    line.isCenterExternalExtra === true ||
    line.externalType === 'centerExternalExtra' ||
    getExternalWorkerTypeFromName(line.personName) === 'centerExternalExtra'
  )
}

const isFilledPersonLine = (line: ServeiGroupRoleLine) =>
  Boolean(String(line.personId || line.personName || '').trim())

/** Compta files de rol amb persona assignada (extra centre inclòs com a treballador). */
export function countFilledCuinaRoleLines(group: CuinaGroup, role: ServeiRoleKey): number {
  return ensureCuinaRoleLines(group).filter(
    (line) => line.role === role && isFilledPersonLine(line)
  ).length
}

export type CuinaStaffTotals = {
  workers: number
  drivers: number
  responsables: number
  /** Treballadors + conductors + responsables assignats. */
  headcount: number
}

export function countCuinaStaffTotals(
  groups: CuinaGroup[],
  manualResponsibleId?: string | null
): CuinaStaffTotals {
  let workers = 0
  let drivers = 0
  let responsables = 0

  for (const group of groups) {
    workers += countFilledCuinaRoleLines(group, 'treballador')
    drivers += countFilledCuinaRoleLines(group, 'conductor')
    if (countFilledCuinaRoleLines(group, 'responsable') > 0) {
      responsables += 1
      continue
    }
    if (group.wantsResponsible && String(group.responsibleId || '').trim()) {
      responsables += 1
    }
  }

  const manualResp = String(manualResponsibleId || '').trim()
  if (responsables === 0 && manualResp && manualResp !== '__auto__') {
    responsables = 1
  }

  return {
    workers,
    drivers,
    responsables,
    headcount: workers + drivers + responsables,
  }
}

export function createCenterExternalExtraLine(group: CuinaGroup): ServeiGroupRoleLine {
  return {
    slotId: makeSlotId(),
    role: 'treballador',
    personId: '',
    personName: getExternalWorkerBaseLabel('centerExternalExtra'),
    isExternal: true,
    externalType: 'centerExternalExtra',
    isCenterExternalExtra: true,
    ...groupDefaults(group),
  }
}

const groupDefaults = (group: CuinaGroup) => ({
  serviceDate: group.serviceDate || '',
  meetingPoint: group.meetingPoint,
  startTime: group.startTime,
  endTime: group.endTime,
  arrivalTime: group.arrivalTime || '',
})

export function createEmptyCuinaRoleLine(
  group: CuinaGroup,
  role: ServeiRoleKey = 'treballador'
): ServeiGroupRoleLine {
  return {
    slotId: makeSlotId(),
    role,
    personId: '',
    personName: '',
    ...groupDefaults(group),
  }
}

const ROLE_DISPLAY_ORDER: Record<ServeiRoleKey, number> = {
  conductor: 0,
  responsable: 1,
  treballador: 2,
  jamonero: 3,
}

function sortRoleLines(lines: ServeiGroupRoleLine[]): ServeiGroupRoleLine[] {
  return [...lines].sort(
    (a, b) => (ROLE_DISPLAY_ORDER[a.role] ?? 9) - (ROLE_DISPLAY_ORDER[b.role] ?? 9)
  )
}

function resolveConductorIdFromDriverMode(
  group: CuinaGroup,
  driverMode?: string
): string {
  if (!driverMode || driverMode === '__auto__') return ''
  if (driverMode === '__responsable__') return group.responsibleId || ''
  return driverMode
}

function roleLinesFromLegacyGroup(group: CuinaGroup): ServeiGroupRoleLine[] {
  const lines: ServeiGroupRoleLine[] = []
  const defaults = groupDefaults(group)

  if (group.wantsResponsible) {
    lines.push({
      slotId: makeSlotId(),
      role: 'responsable',
      personId: group.responsibleId || '',
      personName: '',
      ...defaults,
    })
  }

  const driverAssignments = Array.isArray(group.driverAssignments) ? group.driverAssignments : []
  driverAssignments.forEach((assignment, idx) => {
    const slotId = group.vehicleAssignments?.[idx]?.slotId || makeSlotId()
    lines.push({
      slotId,
      role: 'conductor',
      personId: resolveConductorIdFromDriverMode(group, assignment.driverMode),
      personName: '',
      ...defaults,
      arrivalTime: group.vehicleAssignments?.[idx]?.arrivalTime || group.arrivalTime || '',
    })
  })

  const workerIds = Array.isArray(group.workerIds) ? group.workerIds : []
  workerIds.forEach((personId) => {
    const id = String(personId || '').trim()
    const detail = id ? group.workerDetails?.[id] : undefined
    lines.push({
      slotId: makeSlotId(),
      role: 'treballador',
      personId: id,
      personName: detail?.name,
      serviceDate: detail?.serviceDate || group.serviceDate || '',
      meetingPoint: detail?.meetingPoint || group.meetingPoint,
      startTime: detail?.startTime || group.startTime,
      endTime: detail?.endTime || group.endTime,
      arrivalTime: detail?.arrivalTime || group.arrivalTime || '',
    })
  })

  if (lines.length === 0) {
    lines.push(createEmptyCuinaRoleLine(group, 'treballador'))
  }

  const workerLineCount = lines.filter((line) => line.role === 'treballador').length
  const conductorLineCount = lines.filter((line) => line.role === 'conductor').length
  const targetWorkers = Math.max(0, Number(group.workers) || 0)
  const targetDrivers = Math.max(0, Number(group.drivers) || 0)

  if (workerLineCount === 0 && targetWorkers > 0) {
    const count = Math.min(30, targetWorkers)
    for (let i = 0; i < count; i += 1) {
      lines.push(createEmptyCuinaRoleLine(group, 'treballador'))
    }
  }

  if (conductorLineCount === 0 && targetDrivers > 0) {
    const count = Math.min(10, targetDrivers)
    for (let i = 0; i < count; i += 1) {
      lines.push(createEmptyCuinaRoleLine(group, 'conductor'))
    }
  }

  return sortRoleLines(lines)
}

function vehicleAssignmentsFromLegacy(group: CuinaGroup, roleLines: ServeiGroupRoleLine[]): VehicleAssignment[] {
  if (Array.isArray(group.vehicleAssignments) && group.vehicleAssignments.length > 0) {
    return group.vehicleAssignments
  }

  const driverAssignments = Array.isArray(group.driverAssignments) ? group.driverAssignments : []
  const conductorLines = roleLines.filter((line) => line.role === 'conductor')

  return conductorLines.map((line, idx) => {
    const legacy = driverAssignments[idx]
    return {
      slotId: line.slotId,
      vehicleType: legacy?.vehicleType || group.vehicleType || '',
      vehicleId: '',
      plate: '',
      conductorId: line.personId || null,
      arrivalTime: line.arrivalTime || group.arrivalTime || '',
    }
  })
}

export function ensureCuinaRoleLines(
  group: CuinaGroup,
  assignments: VehicleAssignment[] = []
): ServeiGroupRoleLine[] {
  const vehicleList =
    assignments.length > 0 ? assignments : vehicleAssignmentsFromLegacy(group, [])

  if (Array.isArray(group.roleLines) && group.roleLines.length > 0) {
    return sortRoleLines(group.roleLines)
  }

  const lines = roleLinesFromLegacyGroup(group)
  if (vehicleList.length > 0) {
    const conductorLines = lines.filter((line) => line.role === 'conductor')
    conductorLines.forEach((line, idx) => {
      const assignment = vehicleList[idx]
      if (assignment?.slotId) line.slotId = assignment.slotId
    })
  }

  return sortRoleLines(lines)
}

export function ensureCuinaVehicleAssignments(
  group: CuinaGroup,
  roleLines?: ServeiGroupRoleLine[]
): VehicleAssignment[] {
  const lines = roleLines || ensureCuinaRoleLines(group)
  return vehicleAssignmentsFromLegacy(group, lines)
}

function assignmentForSlot(
  existing: VehicleAssignment[],
  slotId: string,
  conductorId?: string | null,
  arrivalTime = ''
): VehicleAssignment {
  const found = existing.find((entry) => entry.slotId === slotId)
  if (found) {
    return {
      ...found,
      slotId,
      conductorId: conductorId ?? found.conductorId ?? null,
      arrivalTime: arrivalTime || found.arrivalTime || '',
    }
  }
  return {
    slotId,
    vehicleType: '',
    vehicleId: '',
    plate: '',
    conductorId: conductorId ?? null,
    arrivalTime,
  }
}

export function syncCuinaGroupFromRoleLines(
  group: CuinaGroup,
  roleLines: ServeiGroupRoleLine[],
  existingAssignments: VehicleAssignment[]
): CuinaGroup {
  const sorted = sortRoleLines(roleLines)
  const responsable = sorted.find((line) => line.role === 'responsable')
  const conductorLines = sorted.filter((line) => line.role === 'conductor')
  const workerLines = sorted.filter((line) => line.role === 'treballador')

  const vehicleAssignments = conductorLines.map((line) =>
    assignmentForSlot(
      existingAssignments,
      line.slotId,
      line.personId || null,
      line.arrivalTime || group.arrivalTime || ''
    )
  )

  const workerIds = workerLines.map((line) => cuinaWorkerLineKey(line))
  const workerDetails = workerLines.reduce<NonNullable<CuinaGroup['workerDetails']>>((acc, line) => {
    const key = cuinaWorkerLineKey(line)
    if (!key) return acc
    acc[key] = {
      id: String(line.personId || '').trim(),
      name: line.personName,
      serviceDate: line.serviceDate || group.serviceDate || '',
      meetingPoint: line.meetingPoint || group.meetingPoint,
      startTime: line.startTime || group.startTime,
      endTime: line.endTime || group.endTime,
      arrivalTime: line.arrivalTime || group.arrivalTime || '',
    }
    return acc
  }, {})

  const driverAssignments = conductorLines.map((line, idx) => {
    const assignment = vehicleAssignments[idx]
    let driverMode = '__auto__'
    if (line.personId) {
      if (responsable?.personId && line.personId === responsable.personId) {
        driverMode = '__responsable__'
      } else {
        driverMode = line.personId
      }
    }
    return {
      vehicleType: assignment?.vehicleType || '',
      driverMode,
    }
  })

  return {
    ...group,
    roleLines: sorted,
    vehicleAssignments,
    wantsResponsible: sorted.some((line) => line.role === 'responsable'),
    responsibleId: responsable?.personId || '',
    needsDriver: conductorLines.length > 0,
    drivers: conductorLines.length,
    driverAssignments,
    driverMode: driverAssignments[0]?.driverMode ?? '__auto__',
    vehicleType: vehicleAssignments[0]?.vehicleType ?? '',
    workers: workerLines.length,
    workerIds,
    workerDetails,
  }
}

export function patchCuinaGroupRoleLines(
  group: CuinaGroup,
  updater: (lines: ServeiGroupRoleLine[]) => ServeiGroupRoleLine[]
): CuinaGroup {
  const assignments = ensureCuinaVehicleAssignments(group)
  const current = ensureCuinaRoleLines(group, assignments)
  return syncCuinaGroupFromRoleLines(group, updater(current), assignments)
}

export function applyCuinaDefaultsToRoleLines(group: CuinaGroup): CuinaGroup {
  const defaults = groupDefaults(group)
  const assignments = ensureCuinaVehicleAssignments(group)
  const lines = ensureCuinaRoleLines(group, assignments).map((line) => ({
    ...line,
    ...defaults,
  }))
  return syncCuinaGroupFromRoleLines(group, lines, assignments)
}

export function findCuinaAssignmentForLine(
  assignments: VehicleAssignment[],
  line: ServeiGroupRoleLine
): VehicleAssignment {
  return assignmentForSlot(
    assignments,
    line.slotId,
    line.personId || null,
    line.arrivalTime || ''
  )
}

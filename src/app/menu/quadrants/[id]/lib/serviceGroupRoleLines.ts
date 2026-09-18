import type { ServeiGroup, ServeiGroupRoleLine, ServeiRoleKey } from '../phaseConfig'

const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

const isStaffRole = (role: ServeiRoleKey) =>
  role === 'treballador' || role === 'jamonero'

const hasAssignedPerson = (line: ServeiGroupRoleLine) =>
  Boolean(String(line.personId || '').trim() || String(line.personName || '').trim())

export const createEmptyRoleLine = (
  group: ServeiGroup,
  role: ServeiRoleKey = 'treballador'
): ServeiGroupRoleLine => ({
  slotId: makeSlotId(),
  role,
  personId: '',
  personName: '',
  serviceDate: group.serviceDate,
  meetingPoint: group.meetingPoint,
  startTime: group.startTime,
  endTime: group.endTime,
})

const ROLE_DISPLAY_ORDER: Record<ServeiRoleKey, number> = {
  conductor: 0,
  responsable: 1,
  treballador: 2,
  jamonero: 3,
}

export function sortRoleLinesConductorFirst(
  lines: ServeiGroupRoleLine[]
): ServeiGroupRoleLine[] {
  return [...lines].sort(
    (a, b) => (ROLE_DISPLAY_ORDER[a.role] ?? 9) - (ROLE_DISPLAY_ORDER[b.role] ?? 9)
  )
}

export function normalizeGroupRoleLines(
  group: ServeiGroup,
  roleLines: ServeiGroupRoleLine[]
): ServeiGroupRoleLine[] {
  if (roleLines.length === 0) return [createEmptyRoleLine(group, 'conductor')]

  return sortRoleLinesConductorFirst(roleLines)
}

export function roleLinesFromLegacyGroup(group: ServeiGroup): ServeiGroupRoleLine[] {
  const lines: ServeiGroupRoleLine[] = []

  if (group.needsDriver && group.driverId) {
    lines.push({
      slotId: makeSlotId(),
      role: 'conductor',
      personId: group.driverId,
      serviceDate: group.serviceDate,
      meetingPoint: group.meetingPoint,
      startTime: group.startTime,
      endTime: group.endTime,
    })
  }

  if (group.wantsResponsible && group.responsibleId) {
    lines.push({
      slotId: makeSlotId(),
      role: 'responsable',
      personId: group.responsibleId,
      serviceDate: group.serviceDate,
      meetingPoint: group.meetingPoint,
      startTime: group.startTime,
      endTime: group.endTime,
    })
  }

  const workerIds = Array.isArray(group.workerIds) ? group.workerIds.filter(Boolean) : []
  workerIds.forEach((personId) => {
    const details = group.workerDetails?.[personId]
    lines.push({
      slotId: makeSlotId(),
      role: 'treballador',
      personId,
      personName: details?.name,
      serviceDate: details?.serviceDate || group.serviceDate,
      meetingPoint: details?.meetingPoint || group.meetingPoint,
      startTime: details?.startTime || group.startTime,
      endTime: details?.endTime || group.endTime,
    })
  })

  if (lines.length === 0) {
    lines.push(createEmptyRoleLine(group, 'conductor'))
  }

  return lines
}

export function ensureGroupRoleLines(group: ServeiGroup): ServeiGroupRoleLine[] {
  if (Array.isArray(group.roleLines) && group.roleLines.length > 0) {
    return normalizeGroupRoleLines(group, group.roleLines)
  }
  return normalizeGroupRoleLines(group, roleLinesFromLegacyGroup(group))
}

export function syncGroupFromRoleLines(group: ServeiGroup, roleLines: ServeiGroupRoleLine[]): ServeiGroup {
  const normalizedRoleLines = normalizeGroupRoleLines(group, roleLines)
  const filled = normalizedRoleLines.filter(hasAssignedPerson)
  const responsable = filled.find((line) => line.role === 'responsable')
  const conductor = filled.find((line) => line.role === 'conductor')
  const staffLines = normalizedRoleLines.filter((line) => isStaffRole(line.role))
  const filledStaffLines = staffLines.filter(hasAssignedPerson)

  const workerIds = filledStaffLines.map((line) => line.personId)
  const workerDetails = filledStaffLines.reduce<ServeiGroup['workerDetails']>((acc, line) => {
    acc![line.personId] = {
      id: line.personId,
      name: line.personName,
      serviceDate: line.serviceDate || group.serviceDate,
      meetingPoint: line.meetingPoint || group.meetingPoint,
      startTime: line.startTime || group.startTime,
      endTime: line.endTime || group.endTime,
    }
    return acc
  }, {})

  return {
    ...group,
    roleLines: normalizedRoleLines,
    wantsResponsible: normalizedRoleLines.some((line) => line.role === 'responsable'),
    responsibleId: responsable?.personId || '',
    needsDriver: normalizedRoleLines.some((line) => line.role === 'conductor'),
    driverId: conductor?.personId || '',
    workers: staffLines.length,
    jamoneros: staffLines.filter((line) => line.role === 'jamonero').length,
    workerIds,
    workerDetails,
  }
}

export function countServiceGroupRoleLineTotals(roleLines: ServeiGroupRoleLine[]) {
  const staffLines = roleLines.filter((line) => isStaffRole(line.role))
  const filled = roleLines.filter(hasAssignedPerson)

  return {
    workers: staffLines.length,
    jamoneros: staffLines.filter((line) => line.role === 'jamonero').length,
    drivers: filled.filter((line) => line.role === 'conductor').length,
    responsables: filled.filter((line) => line.role === 'responsable').length,
  }
}

export function resizeServiceGroupWorkerSlots(
  group: ServeiGroup,
  workerCount: number
): ServeiGroup {
  const target = Math.max(0, Math.min(30, Math.floor(Number(workerCount) || 0)))
  const current = ensureGroupRoleLines(group)
  const nonStaffLines = current.filter((line) => !isStaffRole(line.role))
  const staffLines = current.filter((line) => isStaffRole(line.role))

  if (staffLines.length === target) return syncGroupFromRoleLines(group, current)

  if (staffLines.length < target) {
    const added = Array.from(
      { length: target - staffLines.length },
      () => createEmptyRoleLine(group, 'treballador')
    )
    return syncGroupFromRoleLines(group, [...nonStaffLines, ...staffLines, ...added])
  }

  const assigned = staffLines.filter(hasAssignedPerson)
  const empty = staffLines.filter((line) => !hasAssignedPerson(line))
  const keptStaff =
    assigned.length >= target
      ? assigned.slice(0, target)
      : [...assigned, ...empty.slice(0, target - assigned.length)]

  return syncGroupFromRoleLines(group, [...nonStaffLines, ...keptStaff])
}

/**
 * Ajusta les línies perquè el total de persones (conductor/responsable + treballadors)
 * coincideixi amb `totalCount`. Descompta les línies no-staff ja creades per defecte.
 */
export function resizeServiceGroupToTotalPersonSlots(
  group: ServeiGroup,
  totalCount: number
): ServeiGroup {
  const targetTotal = Math.max(0, Math.min(30, Math.floor(Number(totalCount) || 0)))
  const current = ensureGroupRoleLines(group)
  const nonStaffCount = current.filter((line) => !isStaffRole(line.role)).length
  const staffTarget = Math.max(0, targetTotal - nonStaffCount)
  return resizeServiceGroupWorkerSlots(group, staffTarget)
}

export function getPrimaryServiceRoleLines(roleLines: ServeiGroupRoleLine[]) {
  const filled = roleLines.filter(
    (line) => String(line.personId || '').trim() || String(line.personName || '').trim()
  )

  return {
    filled,
    responsable: filled.find((line) => line.role === 'responsable'),
    conductor: filled.find((line) => line.role === 'conductor'),
    staffLines: filled.filter((line) => line.role === 'treballador' || line.role === 'jamonero'),
    hasResponsableLine: roleLines.some((line) => line.role === 'responsable'),
  }
}

export function patchGroupRoleLines(
  group: ServeiGroup,
  updater: (lines: ServeiGroupRoleLine[]) => ServeiGroupRoleLine[]
): ServeiGroup {
  const current = ensureGroupRoleLines(group)
  return syncGroupFromRoleLines(group, updater(current))
}

export function applyGroupDefaultsToRoleLines(group: ServeiGroup): ServeiGroup {
  const lines = ensureGroupRoleLines(group).map((line) => ({
    ...line,
    meetingPoint: group.meetingPoint,
    serviceDate: group.serviceDate,
    startTime: group.startTime,
    endTime: group.endTime,
  }))
  return syncGroupFromRoleLines(group, lines)
}

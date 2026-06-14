import type { ServeiGroup, ServeiGroupRoleLine, ServeiRoleKey } from '../phaseConfig'

const makeSlotId = () => `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`

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

  const sorted = sortRoleLinesConductorFirst(roleLines)
  const first = sorted[0]
  if (!String(first.personId || '').trim() && first.role !== 'conductor') {
    sorted[0] = {
      ...first,
      role: 'conductor',
      personId: '',
      personName: String(first.personName || '').trim(),
    }
  }
  return sorted
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
  const filled = normalizedRoleLines.filter((line) => String(line.personId || '').trim())
  const responsable = filled.find((line) => line.role === 'responsable')
  const conductor = filled.find((line) => line.role === 'conductor')
  const staffLines = filled.filter((line) => line.role === 'treballador' || line.role === 'jamonero')

  const workerIds = staffLines.map((line) => line.personId)
  const workerDetails = staffLines.reduce<ServeiGroup['workerDetails']>((acc, line) => {
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
    workers: filled.length,
    jamoneros: filled.filter((line) => line.role === 'jamonero').length,
    workerIds,
    workerDetails,
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

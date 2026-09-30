import type { ServeiGroupRoleLine, ServeiRoleKey } from '../phaseConfig'

const MAX_PERSON_SLOTS = 30

type ResizeRoleLineSlotsOptions = {
  roleLines: ServeiGroupRoleLine[]
  targetCount: number
  createStaffLine: () => ServeiGroupRoleLine
  isStaffRole?: (role: ServeiRoleKey) => boolean
}

const defaultIsStaffRole = (role: ServeiRoleKey) =>
  role === 'treballador' || role === 'jamonero'

const hasAssignedPerson = (line: ServeiGroupRoleLine) =>
  Boolean(String(line.personId || '').trim() || String(line.personName || '').trim())

const normalizeTarget = (value: number) =>
  Math.max(0, Math.min(MAX_PERSON_SLOTS, Math.floor(Number(value) || 0)))

/**
 * Ajusta les files de personal d'un grup conservant les files de conductor i
 * responsable. En reduir, prioritza les files que ja tenen una persona assignada.
 */
export function resizeStaffRoleLineSlots({
  roleLines,
  targetCount,
  createStaffLine,
  isStaffRole = defaultIsStaffRole,
}: ResizeRoleLineSlotsOptions): ServeiGroupRoleLine[] {
  const target = normalizeTarget(targetCount)
  const nonStaffLines = roleLines.filter((line) => !isStaffRole(line.role))
  const staffLines = roleLines.filter((line) => isStaffRole(line.role))

  if (staffLines.length === target) return roleLines

  if (staffLines.length < target) {
    const added = Array.from({ length: target - staffLines.length }, createStaffLine)
    return [...nonStaffLines, ...staffLines, ...added]
  }

  const assigned = staffLines.filter(hasAssignedPerson)
  const empty = staffLines.filter((line) => !hasAssignedPerson(line))
  const keptStaff =
    assigned.length >= target
      ? assigned.slice(0, target)
      : [...assigned, ...empty.slice(0, target - assigned.length)]

  return [...nonStaffLines, ...keptStaff]
}

/**
 * Ajusta el total de persones visible, descomptant les files no-staff que ja
 * existeixen (conductors/responsables) abans de crear files de treballador.
 */
export function resizeRoleLinesToTotalPersonSlots(
  options: ResizeRoleLineSlotsOptions
): ServeiGroupRoleLine[] {
  const isStaffRole = options.isStaffRole || defaultIsStaffRole
  const targetTotal = normalizeTarget(options.targetCount)
  const nonStaffCount = options.roleLines.filter(
    (line) => !isStaffRole(line.role)
  ).length

  return resizeStaffRoleLineSlots({
    ...options,
    targetCount: Math.max(0, targetTotal - nonStaffCount),
    isStaffRole,
  })
}

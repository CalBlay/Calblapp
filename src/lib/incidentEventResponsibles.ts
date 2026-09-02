export const INCIDENT_RESPONSIBLE_DEPARTMENTS = [
  'logistica',
  'cuina',
  'serveis',
] as const

export type IncidentResponsibleDepartment =
  (typeof INCIDENT_RESPONSIBLE_DEPARTMENTS)[number]

export type IncidentEventResponsible = {
  department: IncidentResponsibleDepartment
  name: string
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const readName = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  const record = asRecord(value)
  return String(record?.name || record?.personName || '').trim()
}

export function extractQuadrantResponsibleNames(
  quadrant: Record<string, unknown>
): string[] {
  const names = new Set<string>()
  const add = (value: unknown) => {
    const name = readName(value)
    if (name) names.add(name)
  }

  add(quadrant.responsableName)
  add(quadrant.responsibleName)
  add(quadrant.responsable)
  add(quadrant.responsible)

  for (const value of Array.isArray(quadrant.responsables)
    ? quadrant.responsables
    : []) {
    add(value)
  }

  for (const rawGroup of Array.isArray(quadrant.groups) ? quadrant.groups : []) {
    const group = asRecord(rawGroup)
    if (!group) continue
    add(group.responsableName)
    add(group.responsibleName)
    add(group.responsable)
    add(group.responsible)

    for (const rawLine of Array.isArray(group.roleLines) ? group.roleLines : []) {
      const line = asRecord(rawLine)
      const role = String(line?.role || '').trim().toLowerCase()
      if (role.includes('respons')) add(line)
    }
  }

  return Array.from(names)
}

export function incidentResponsibleDepartmentLabel(
  department: IncidentResponsibleDepartment
): string {
  if (department === 'logistica') return 'Logística'
  if (department === 'cuina') return 'Cuina'
  return 'Serveis'
}

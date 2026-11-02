export type QuadrantPersonnelRole = 'responsable' | 'conductor' | 'treballador'

export type QuadrantScheduledPerson = Record<string, unknown> & {
  id?: string
  name: string
  role: QuadrantPersonnelRole
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  meetingPoint: string
  groupId?: string
}

type UnknownRow = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const norm = (value: unknown) =>
  text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function attachManualWorkerLineSchedules<
  T extends { name: string; meetingPoint?: string; isJamonero?: boolean },
>(
  workers: T[],
  manualWorkers: Array<Record<string, unknown>>,
  defaults: {
    startDate?: string
    endDate?: string
    startTime?: string
    endTime?: string
    meetingPoint?: string
    arrivalTime?: string | null
  }
) {
  const byName = new Map(
    manualWorkers
      .filter((worker) => personName(worker))
      .map((worker) => [norm(worker.name || worker.personName), worker] as const)
  )

  return workers.map((worker) => {
    const line = byName.get(norm(worker.name))
    if (!line) {
      return {
        ...worker,
        meetingPoint: worker.meetingPoint || defaults.meetingPoint || '',
      }
    }
    const startDate = text(line.serviceDate || line.startDate) || defaults.startDate || ''
    return {
      ...worker,
      meetingPoint: text(line.meetingPoint) || worker.meetingPoint || defaults.meetingPoint || '',
      startDate,
      endDate: text(line.endDate) || text(line.serviceDate) || defaults.endDate || startDate,
      startTime: text(line.startTime) || defaults.startTime || '',
      endTime: text(line.endTime) || defaults.endTime || '',
      arrivalTime: text(line.arrivalTime) || defaults.arrivalTime || null,
    }
  })
}

function roleOf(value: unknown, fallback: QuadrantPersonnelRole): QuadrantPersonnelRole {
  const role = norm(value)
  if (role.startsWith('res')) return 'responsable'
  if (role.startsWith('con')) return 'conductor'
  return fallback
}

function identity(row: UnknownRow) {
  const id = text(row.id || row.personId || row.workerId || row.uid)
  if (id) return `id:${id}`
  const name = norm(row.name || row.personName || row.nom || row.displayName)
  return name ? `name:${name}` : ''
}

function personName(row: UnknownRow) {
  return text(row.name || row.personName || row.nom || row.displayName)
}

function basePeople(doc: UnknownRow) {
  const out: Array<UnknownRow & { role: QuadrantPersonnelRole }> = []
  const push = (value: unknown, role: QuadrantPersonnelRole) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const row = value as UnknownRow
    if (!personName(row) && !identity(row)) return
    out.push({ ...row, role })
  }
  const pushArray = (value: unknown, role: QuadrantPersonnelRole) => {
    if (!Array.isArray(value)) return
    value.forEach((row) => push(row, role))
  }

  if (Array.isArray(doc.responsable)) pushArray(doc.responsable, 'responsable')
  else push(doc.responsable, 'responsable')
  pushArray(doc.responsables, 'responsable')
  pushArray(doc.conductors, 'conductor')
  pushArray(doc.treballadors, 'treballador')
  pushArray(doc.workers, 'treballador')

  if (!out.some((row) => row.role === 'responsable') && text(doc.responsableName)) {
    out.push({
      id: text(doc.responsableId),
      name: text(doc.responsableName),
      role: 'responsable',
    })
  }
  return out
}

function findBasePerson(
  people: Array<UnknownRow & { role: QuadrantPersonnelRole }>,
  line: UnknownRow
) {
  const lineId = text(line.personId || line.id || line.workerId)
  const lineName = norm(line.personName || line.name)
  return people.find((person) => {
    const personId = text(person.id || person.personId || person.workerId || person.uid)
    if (lineId && personId && lineId === personId) return true
    return Boolean(lineName && norm(person.name || person.personName) === lineName)
  })
}

function scheduledPerson(params: {
  doc: UnknownRow
  base?: UnknownRow & { role: QuadrantPersonnelRole }
  line?: UnknownRow
  group?: UnknownRow
  fallbackRole: QuadrantPersonnelRole
}): QuadrantScheduledPerson | null {
  const {
    doc,
    base = {} as UnknownRow & { role: QuadrantPersonnelRole },
    line = {} as UnknownRow,
    group = {} as UnknownRow,
    fallbackRole,
  } = params
  const name = personName(line) || personName(base)
  if (!name) return null
  const startDate =
    text(line.serviceDate || line.startDate) ||
    text(group.serviceDate || group.startDate) ||
    text(doc.phaseDate || doc.startDate || doc.date)
  const endDate =
    text(line.endDate) || text(group.endDate) || text(doc.endDate) || startDate

  return {
    ...base,
    ...line,
    id: text(line.personId || line.id || base.id || base.personId || base.workerId) || undefined,
    name,
    role: roleOf(line.role, base.role || fallbackRole),
    startDate,
    endDate,
    startTime:
      text(line.startTime || line.time || line.hour) ||
      text(group.startTime) ||
      text(base.startTime || base.time || base.hour) ||
      text(doc.startTime || doc.hour || doc.convocatoria),
    endTime:
      text(line.endTime) ||
      text(group.endTime) ||
      text(base.endTime) ||
      text(doc.endTime),
    meetingPoint:
      text(line.meetingPoint) ||
      text(group.meetingPoint) ||
      text(base.meetingPoint) ||
      text(doc.meetingPoint),
    groupId: text(group.id || group.groupId) || undefined,
  }
}

/**
 * Resol l'horari efectiu de cada persona. Les `roleLines` tenen prioritat sobre
 * els arrays generals i sobre la capcalera; aquests dos darrers nomes son
 * fallback per a quadrants antics.
 */
export function collectQuadrantLinePersonnel(input: unknown): QuadrantScheduledPerson[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return []
  const doc = input as UnknownRow
  const people = basePeople(doc)
  const result: QuadrantScheduledPerson[] = []
  const represented = new Set<string>()
  const groups = Array.isArray(doc.groups) ? (doc.groups as UnknownRow[]) : []

  for (const group of groups) {
    const roleLines = Array.isArray(group.roleLines) ? (group.roleLines as UnknownRow[]) : []
    for (const line of roleLines) {
      if (!text(line.personName || line.name) && !text(line.personId || line.id)) continue
      const fallbackRole = roleOf(line.role, 'treballador')
      const base = findBasePerson(people, line)
      const person = scheduledPerson({ doc, base, line, group, fallbackRole })
      if (!person) continue
      result.push(person)
      const baseKey = base ? identity(base) : ''
      if (baseKey) represented.add(baseKey)
    }
  }

  for (const base of people) {
    if (represented.has(identity(base))) continue
    const person = scheduledPerson({ doc, base, fallbackRole: base.role })
    if (person) result.push(person)
  }

  return result
}


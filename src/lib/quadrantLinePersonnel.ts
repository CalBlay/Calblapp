export type QuadrantPersonnelRole = 'responsable' | 'conductor' | 'treballador'

export type QuadrantScheduledPerson = Record<string, unknown> & {
  id?: string
  name: string
  role: QuadrantPersonnelRole
  startDate: string
  endDate: string
  startTime: string
  /** Convocatòria original, abans d'una possible arribada tardana. */
  plannedStartTime: string
  /** Hora real d'arribada informada al tancament operatiu. */
  startTimeReal: string
  endTime: string
  meetingPoint: string
  groupId?: string
  closingRevision?: number
  closingChangedAt?: string
  closingCorrectionReason?: string
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

function findPersonGroup(
  base: UnknownRow & { role: QuadrantPersonnelRole },
  groups: UnknownRow[]
) {
  const explicitGroupId = text(base.groupId)
  if (explicitGroupId) {
    const explicit = groups.find(
      (group) => text(group.id || group.groupId) === explicitGroupId
    )
    if (explicit) return explicit
  }

  const fields: Array<[string, (group: UnknownRow) => string, number]> = [
    [text(base.serviceDate || base.startDate), (group) => text(group.serviceDate || group.startDate), 4],
    [text(base.startTime || base.time || base.hour), (group) => text(group.startTime), 4],
    [text(base.endTime), (group) => text(group.endTime), 2],
    [text(base.meetingPoint), (group) => text(group.meetingPoint), 1],
  ]
  const comparable = fields.filter(([value]) => Boolean(value))
  if (comparable.length > 0) {
    let bestGroup: UnknownRow | undefined
    let bestScore = 0
    for (const group of groups) {
      let score = 0
      for (const [value, groupValue, weight] of comparable) {
        const candidate = groupValue(group)
        if (candidate === value) score += weight
        else if (candidate) score -= weight
      }
      if (score > bestScore) {
        bestGroup = group
        bestScore = score
      }
    }
    if (bestGroup) return bestGroup
  }

  // Sense grup, aquests rols es replicarien a totes les convocatòries.
  if (base.role === 'responsable' || base.role === 'conductor') return groups[0]
  return undefined
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
  const hasLineDate = Boolean(
    text(line.serviceDate || line.startDate || group.serviceDate || group.startDate)
  )
  const endDate =
    text(line.endDate) ||
    text(group.endDate) ||
    (hasLineDate ? startDate : text(doc.endDate)) ||
    startDate

  const plannedStartTime =
    text(line.startTime || line.time || line.hour) ||
    text(group.startTime) ||
    text(base.startTime || base.time || base.hour) ||
    text(doc.startTime || doc.hour || doc.convocatoria)
  const startTimeReal =
    text(line.startTimeReal) ||
    text(base.startTimeReal)

  return {
    ...base,
    ...line,
    id: text(line.personId || line.id || base.id || base.personId || base.workerId) || undefined,
    name,
    role: roleOf(line.role, base.role || fallbackRole),
    startDate,
    endDate,
    // L'hora real passa a ser l'inici efectiu per a tots els consumidors
    // (informes, càrrega horària, costos i torns), sense perdre la convocatòria.
    startTime: startTimeReal || plannedStartTime,
    plannedStartTime,
    startTimeReal,
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
    closingRevision:
      Number(line.closingRevision || base.closingRevision) ||
      (line.sortidaSetBy || base.sortidaSetBy ? 1 : 0),
    closingChangedAt: text(line.closingChangedAt || base.closingChangedAt),
    closingCorrectionReason: text(
      (line.closingCorrection as UnknownRow | undefined)?.reason ||
        (base.closingCorrection as UnknownRow | undefined)?.reason
    ),
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

    const pushLegacyGroupPerson = (
      role: QuadrantPersonnelRole,
      idValue: unknown,
      nameValue: unknown
    ) => {
      const id = text(idValue)
      const name = text(nameValue)
      if (!id && !name) return
      const alreadyInRoleLines = roleLines.some((line) => {
        if (roleOf(line.role, 'treballador') !== role) return false
        const lineId = text(line.personId || line.id)
        if (id && lineId && id === lineId) return true
        return Boolean(name && norm(line.personName || line.name) === norm(name))
      })
      if (alreadyInRoleLines) return

      const line: UnknownRow = { personId: id, personName: name, role }
      const base = findBasePerson(people, line)
      const person = scheduledPerson({ doc, base, line, group, fallbackRole: role })
      if (!person) return
      result.push(person)
      const baseKey = base ? identity(base) : ''
      if (baseKey) represented.add(baseKey)
    }

    pushLegacyGroupPerson('responsable', group.responsibleId, group.responsibleName)
    pushLegacyGroupPerson('conductor', group.driverId, group.driverName)
  }

  for (const base of people) {
    if (represented.has(identity(base))) continue
    const fallbackGroup = findPersonGroup(base, groups)
    // Els responsables i conductors antics es vinculen a un únic grup perquè
    // no es repliquin a totes les convocatòries del servei.
    const person = scheduledPerson({
      doc,
      base,
      group: fallbackGroup,
      fallbackRole: base.role,
    })
    if (person) result.push(person)
  }

  return result
}


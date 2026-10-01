export type QuadrantNotificationAssignment = {
  personId: string
  name: string
  role: string
  docId: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  meetingPoint: string
  vehicleType: string
  plate: string
}

export type QuadrantNotificationDoc = {
  responsable?: Record<string, unknown> | null
  responsableId?: unknown
  responsableName?: unknown
  responsables?: Array<Record<string, unknown>>
  conductors?: Array<Record<string, unknown>>
  treballadors?: Array<Record<string, unknown>>
  groups?: Array<Record<string, unknown>>
  startDate?: unknown
  endDate?: unknown
  startTime?: unknown
  endTime?: unknown
  meetingPoint?: unknown
  quadrantNotificationAssignments?: QuadrantNotificationAssignment[]
  [key: string]: unknown
}

export type QuadrantNotificationPlan = {
  kind: 'first_confirmation' | 'changed'
  recipients: Array<{ personId: string; name: string }>
  currentAssignments: QuadrantNotificationAssignment[]
  affectedAssignments: QuadrantNotificationAssignment[]
}

const text = (value: unknown) => String(value ?? '').trim()

export const normalizeQuadrantPersonName = (value: unknown) =>
  text(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function assignmentFrom(params: {
  source: Record<string, unknown>
  doc: QuadrantNotificationDoc
  docId: string
  role: string
  fallbackId?: unknown
  fallbackName?: unknown
}): QuadrantNotificationAssignment | null {
  const { source, doc, docId, role } = params
  if (source.isExternal === true) return null
  const personId = text(source.id || source.userId || source.personId || params.fallbackId)
  const name = text(source.name || source.personName || params.fallbackName)
  if ((!personId && !name) || normalizeQuadrantPersonName(name) === 'extra') return null

  const startDate = text(source.startDate || source.serviceDate || doc.startDate)
  return {
    personId,
    name,
    role,
    docId,
    startDate,
    endDate: text(source.endDate || doc.endDate || startDate),
    startTime: text(source.startTime || doc.startTime),
    endTime: text(source.endTime || doc.endTime),
    meetingPoint: text(source.meetingPoint || doc.meetingPoint),
    vehicleType: text(source.vehicleType),
    plate: text(source.plate),
  }
}

export function extractQuadrantNotificationAssignments(
  doc: QuadrantNotificationDoc | null,
  docId = ''
): QuadrantNotificationAssignment[] {
  if (!doc) return []
  const out: QuadrantNotificationAssignment[] = []
  const add = (
    source: unknown,
    role: string,
    fallback?: { id?: unknown; name?: unknown }
  ) => {
    const assignment = assignmentFrom({
      source: asRecord(source),
      doc,
      docId,
      role,
      fallbackId: fallback?.id,
      fallbackName: fallback?.name,
    })
    if (assignment) out.push(assignment)
  }

  add(doc.responsable, 'responsable', {
    id: doc.responsableId,
    name: doc.responsableName,
  })
  ;(Array.isArray(doc.responsables) ? doc.responsables : []).forEach((person) =>
    add(person, 'responsable')
  )
  ;(Array.isArray(doc.conductors) ? doc.conductors : []).forEach((person) =>
    add(person, 'conductor')
  )
  ;(Array.isArray(doc.treballadors) ? doc.treballadors : []).forEach((person) =>
    add(person, 'treballador')
  )

  ;(Array.isArray(doc.groups) ? doc.groups : []).forEach((rawGroup) => {
    const group = asRecord(rawGroup)
    const groupDoc: QuadrantNotificationDoc = {
      ...doc,
      startDate: group.serviceDate || group.startDate || doc.startDate,
      endDate: group.endDate || doc.endDate,
      startTime: group.startTime || doc.startTime,
      endTime: group.endTime || doc.endTime,
      meetingPoint: group.meetingPoint || doc.meetingPoint,
    }
    const addGroup = (source: unknown, role: string, fallback?: { id?: unknown; name?: unknown }) => {
      const assignment = assignmentFrom({
        source: asRecord(source),
        doc: groupDoc,
        docId,
        role,
        fallbackId: fallback?.id,
        fallbackName: fallback?.name,
      })
      if (assignment) out.push(assignment)
    }
    addGroup({}, 'responsable', { id: group.responsibleId, name: group.responsibleName })
    addGroup({}, 'conductor', { id: group.driverId, name: group.driverName })
    ;(Array.isArray(group.roleLines) ? group.roleLines : []).forEach((rawLine) => {
      const line = asRecord(rawLine)
      addGroup(line, text(line.role) || 'treballador')
    })
    ;(Array.isArray(group.manualWorkers) ? group.manualWorkers : []).forEach((worker) =>
      addGroup(worker, 'treballador')
    )
  })

  const idByName = new Map<string, string>()
  out.forEach((assignment) => {
    const normalizedName = normalizeQuadrantPersonName(assignment.name)
    if (assignment.personId && normalizedName) idByName.set(normalizedName, assignment.personId)
  })

  const seen = new Set<string>()
  return out
    .map((assignment) => ({
      ...assignment,
      personId:
        assignment.personId || idByName.get(normalizeQuadrantPersonName(assignment.name)) || '',
    }))
    .filter((assignment) => {
      const key = JSON.stringify(assignment)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function canonicalPersonKey(
  assignment: Pick<QuadrantNotificationAssignment, 'personId' | 'name'>,
  idByName: Map<string, string>
) {
  const normalizedName = normalizeQuadrantPersonName(assignment.name)
  const personId = assignment.personId || idByName.get(normalizedName) || ''
  return personId ? `id:${personId}` : `name:${normalizedName}`
}

function assignmentSignature(assignment: QuadrantNotificationAssignment) {
  return [
    assignment.docId,
    assignment.role,
    assignment.startDate,
    assignment.endDate,
    assignment.startTime,
    assignment.endTime,
    assignment.meetingPoint,
    assignment.vehicleType,
    assignment.plate,
  ].join('\u001f')
}

function sameSignatures(left: string[] | undefined, right: string[] | undefined) {
  if (!left || !right || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function buildQuadrantNotificationPlan(
  docs: Array<{ docId: string; doc: QuadrantNotificationDoc }>
): QuadrantNotificationPlan {
  const currentAssignments = docs.flatMap(({ docId, doc }) =>
    extractQuadrantNotificationAssignments(doc, docId)
  )
  const previousAssignments = docs.flatMap(({ doc }) =>
    Array.isArray(doc.quadrantNotificationAssignments)
      ? doc.quadrantNotificationAssignments
      : []
  )
  const kind = previousAssignments.length > 0 ? 'changed' : 'first_confirmation'
  const allAssignments = [...currentAssignments, ...previousAssignments]
  const idByName = new Map<string, string>()
  allAssignments.forEach((assignment) => {
    const normalizedName = normalizeQuadrantPersonName(assignment.name)
    if (assignment.personId && normalizedName) idByName.set(normalizedName, assignment.personId)
  })

  const group = (assignments: QuadrantNotificationAssignment[]) => {
    const map = new Map<string, string[]>()
    assignments.forEach((assignment) => {
      const key = canonicalPersonKey(assignment, idByName)
      const values = map.get(key) || []
      values.push(assignmentSignature(assignment))
      map.set(key, values)
    })
    map.forEach((values) => values.sort())
    return map
  }

  const currentByPerson = group(currentAssignments)
  const previousByPerson = group(previousAssignments)
  const affectedKeys = new Set<string>()
  if (kind === 'first_confirmation') {
    currentByPerson.forEach((_value, key) => affectedKeys.add(key))
  } else {
    new Set([...currentByPerson.keys(), ...previousByPerson.keys()]).forEach((key) => {
      if (!sameSignatures(currentByPerson.get(key), previousByPerson.get(key))) {
        affectedKeys.add(key)
      }
    })
  }

  const affectedAssignments = allAssignments.filter((assignment) =>
    affectedKeys.has(canonicalPersonKey(assignment, idByName))
  )
  const recipients = new Map<string, { personId: string; name: string }>()
  affectedAssignments.forEach((assignment) => {
    const key = canonicalPersonKey(assignment, idByName)
    const previous = recipients.get(key)
    recipients.set(key, {
      personId: assignment.personId || previous?.personId || idByName.get(normalizeQuadrantPersonName(assignment.name)) || '',
      name: assignment.name || previous?.name || '',
    })
  })

  return {
    kind,
    recipients: [...recipients.values()],
    currentAssignments,
    affectedAssignments,
  }
}

export function assignmentsByDocId(assignments: QuadrantNotificationAssignment[]) {
  const result: Record<string, QuadrantNotificationAssignment[]> = {}
  assignments.forEach((assignment) => {
    if (!assignment.docId) return
    ;(result[assignment.docId] ||= []).push(assignment)
  })
  return result
}

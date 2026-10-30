export type DayReassignmentPerson = {
  id?: string | null
  name?: string | null
  startDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  meetingPoint?: string | null
  groupId?: string | null
  [key: string]: unknown
}

export type DayReassignmentOperation = {
  operationId: string
  sourceDocId?: string | null
  destinationDocId?: string | null
  personId?: string | null
  personName: string
}

export type DayReassignmentDocument = {
  eventId?: string | null
  eventName?: string | null
  code?: string | null
  status?: string | null
  startDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  meetingPoint?: string | null
  responsable?: DayReassignmentPerson | null
  responsableId?: string | null
  responsableName?: string | null
  responsables?: DayReassignmentPerson[]
  conductors?: DayReassignmentPerson[]
  treballadors?: DayReassignmentPerson[]
  groups?: Array<Record<string, unknown> & {
    id?: string | null
    serviceDate?: string | null
    startDate?: string | null
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
    meetingPoint?: string | null
    roleLines?: Array<Record<string, unknown> & {
      slotId?: string | null
      role?: string | null
      personId?: string | null
      personName?: string | null
    }>
  }>
  [key: string]: unknown
}

const norm = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export const reassignmentPersonKey = (id?: unknown, name?: unknown) =>
  norm(id) || norm(name)

export function isPersonAffectedByReassignment(
  person: { id?: unknown; name?: unknown },
  operations: DayReassignmentOperation[]
) {
  const personId = norm(person.id)
  const personName = norm(person.name)
  if (!personId && !personName) return false
  return operations.some((operation) => {
    const operationId = norm(operation.personId)
    if (personId && operationId) return personId === operationId
    return Boolean(personName && personName === norm(operation.personName))
  })
}

export function shouldIgnoreBusyQuadrantForMove(params: {
  currentCollectionId: string
  busyCollectionId: string
  busyDocId: string
  sourceDocId: string | null
  destinationDocId: string
}) {
  return (
    params.busyCollectionId === params.currentCollectionId &&
    (params.busyDocId === params.sourceDocId ||
      params.busyDocId === params.destinationDocId)
  )
}

const assignedRoleKeys = (doc: DayReassignmentDocument) => {
  const keys = new Set<string>()
  const add = (person?: DayReassignmentPerson | null) => {
    const key = reassignmentPersonKey(person?.id, person?.name)
    if (key) keys.add(key)
  }
  add(doc.responsable)
  const topResponsibleKey = reassignmentPersonKey(doc.responsableId, doc.responsableName)
  if (topResponsibleKey) keys.add(topResponsibleKey)
  ;(doc.responsables || []).forEach(add)
  ;(doc.conductors || []).forEach(add)
  return keys
}

const isOperationalWorker = (person: DayReassignmentPerson) => {
  const name = String(person?.name || '').trim()
  return Boolean(name && name.toLowerCase() !== 'extra' && person?.isExternal !== true)
}

export function extractReassignableWorkers(doc: DayReassignmentDocument): DayReassignmentPerson[] {
  const roleKeys = assignedRoleKeys(doc)
  const seen = new Set<string>()
  const seenNames = new Map<string, string | null>()
  const workers: DayReassignmentPerson[] = []
  const add = (person: DayReassignmentPerson) => {
    if (!isOperationalWorker(person)) return
    const key = reassignmentPersonKey(person.id, person.name)
    const idKey = norm(person.id)
    const nameKey = norm(person.name)
    const previousIdForName = seenNames.get(nameKey)
    const duplicatesKnownPerson = idKey
      ? seen.has(idKey) || previousIdForName === null
      : seenNames.has(nameKey)
    if (!key || roleKeys.has(key) || duplicatesKnownPerson) return
    seen.add(key)
    if (nameKey) seenNames.set(nameKey, idKey || null)
    workers.push(person)
  }

  ;(doc.treballadors || []).forEach(add)
  ;(doc.groups || []).forEach((group) => {
    ;(group.roleLines || []).forEach((line) => {
      if (norm(line.role) !== 'treballador') return
      add({
        id: line.personId,
        name: line.personName,
        startDate: group.serviceDate || group.startDate || doc.startDate,
        endDate: group.endDate || doc.endDate || group.serviceDate || doc.startDate,
        startTime: group.startTime || doc.startTime,
        endTime: group.endTime || doc.endTime,
        meetingPoint: group.meetingPoint || doc.meetingPoint,
        groupId: group.id,
      })
    })
  })
  return workers
}

const personMatches = (
  person: { id?: unknown; name?: unknown; personId?: unknown; personName?: unknown },
  operation: DayReassignmentOperation
) =>
  isPersonAffectedByReassignment(
    {
      id: person.id ?? person.personId,
      name: person.name ?? person.personName,
    },
    [operation]
  )

export function applyDayReassignmentOperations(
  docId: string,
  doc: DayReassignmentDocument,
  operations: DayReassignmentOperation[]
): Pick<DayReassignmentDocument, 'treballadors' | 'groups' | 'totalWorkers'> {
  const removals = operations.filter((operation) => operation.sourceDocId === docId)
  const additions = operations.filter((operation) => operation.destinationDocId === docId)
  const remainingWorkers = (doc.treballadors || []).filter(
    (person) => !removals.some((operation) => personMatches(person, operation))
  )
  const firstGroup = (doc.groups || [])[0]
  const additionsAsWorkers: DayReassignmentPerson[] = additions.map((operation) => {
    const worker: DayReassignmentPerson = {
      name: operation.personName,
      meetingPoint: firstGroup?.meetingPoint || doc.meetingPoint || '',
      startDate: firstGroup?.serviceDate || firstGroup?.startDate || doc.startDate || '',
      endDate:
        firstGroup?.endDate || doc.endDate || firstGroup?.serviceDate || doc.startDate || '',
      startTime: firstGroup?.startTime || doc.startTime || '',
      endTime: firstGroup?.endTime || doc.endTime || '',
    }
    const personId = String(operation.personId || '').trim()
    const groupId = String(firstGroup?.id || '').trim()
    if (personId) worker.id = personId
    if (groupId) worker.groupId = groupId
    return worker
  })

  const workerMap = new Map<string, DayReassignmentPerson>()
  ;[...remainingWorkers, ...additionsAsWorkers].forEach((person) => {
    const key = reassignmentPersonKey(person.id, person.name)
    if (key) workerMap.set(key, person)
  })
  const treballadors = Array.from(workerMap.values())

  const groups = (doc.groups || []).map((group, groupIndex) => {
    const remainingLines = (group.roleLines || []).filter(
      (line) =>
        norm(line.role) !== 'treballador' ||
        !removals.some((operation) => personMatches(line, operation))
    )
    const groupAdditions = groupIndex === 0 ? additions : []
    const addedLines = groupAdditions.map((operation, index) => ({
      slotId: `reassign-${Date.now()}-${index}`,
      role: 'treballador',
      personId: String(operation.personId || '').trim(),
      personName: operation.personName,
      serviceDate: group.serviceDate || group.startDate || doc.startDate || '',
      meetingPoint: group.meetingPoint || doc.meetingPoint || '',
      startTime: group.startTime || doc.startTime || '',
      endTime: group.endTime || doc.endTime || '',
    }))
    const roleLines = [...remainingLines, ...addedLines]
    const assignedNames = new Set(
      roleLines
        .map((line) => norm(line.personName))
        .filter((name) => name && name !== 'extra')
    )
    return {
      ...group,
      roleLines,
      workers: assignedNames.size,
    }
  })

  return {
    treballadors,
    groups,
    totalWorkers: treballadors.filter(isOperationalWorker).length,
  }
}


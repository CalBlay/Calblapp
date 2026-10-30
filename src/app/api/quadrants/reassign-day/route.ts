import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { PERM } from '@/lib/permissionKeys'
import { canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import { QUADRANTS_REOPEN_PERM } from '@/lib/quadrantsPermissions'
import {
  listOperationalQuadrantCollectionIds,
  resolveQuadrantCollection,
} from '@/lib/firestoreCollections'
import { fetchQuadrantDocsByEndDate, loadPersonnelRules } from '@/utils/personnelRest'
import { loadDepartmentPersonnel } from '@/services/premises'
import { evaluateRangeEligibility, type EligibilityReason } from '@/services/eligibility'
import {
  applyDayReassignmentOperations,
  extractReassignableWorkers,
  isPersonAffectedByReassignment,
  reassignmentPersonKey,
  shouldIgnoreBusyQuadrantForMove,
  type DayReassignmentDocument,
  type DayReassignmentOperation,
  type DayReassignmentPerson,
} from '@/lib/quadrantDayReassignment'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'

export const runtime = 'nodejs'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const norm = (value?: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const isCancelled = (doc: DayReassignmentDocument) =>
  ['cancelled', 'canceled', 'cancelat', 'cancelada', 'anullat', 'anulat'].includes(
    norm(doc.status)
  )

const docTouchesDay = (doc: DayReassignmentDocument, day: string) => {
  const start = String(doc.startDate || '').slice(0, 10)
  const end = String(doc.endDate || doc.startDate || '').slice(0, 10)
  if (start && start <= day && (!end || end >= day)) return true
  return (doc.groups || []).some(
    (group) => String(group.serviceDate || group.startDate || '').slice(0, 10) === day
  )
}

type RangeAssignment = {
  id?: string | null
  name?: string | null
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  sourceLabel: string
}

const assignmentFromPerson = (
  person: DayReassignmentPerson | null | undefined,
  doc: DayReassignmentDocument,
  sourceLabel: string
): RangeAssignment | null => {
  if (!person) return null
  const id = String(person.id || '').trim()
  const name = String(person.name || '').trim()
  if ((!id && !name) || name.toLowerCase() === 'extra') return null
  const startDate = String(person.startDate || doc.startDate || '').slice(0, 10)
  const endDate = String(person.endDate || doc.endDate || startDate).slice(0, 10)
  if (!startDate || !endDate) return null
  return {
    id: id || null,
    name: name || null,
    startDate,
    endDate,
    startTime: String(person.startTime || doc.startTime || '00:00').slice(0, 5),
    endTime: String(person.endTime || doc.endTime || '23:59').slice(0, 5),
    sourceLabel,
  }
}

const extractAssignments = (doc: DayReassignmentDocument, sourceLabel: string) => {
  const entries: RangeAssignment[] = []
  const push = (person?: DayReassignmentPerson | null) => {
    const assignment = assignmentFromPerson(person, doc, sourceLabel)
    if (assignment) entries.push(assignment)
  }
  push(doc.responsable)
  if (doc.responsableName || doc.responsableId) {
    push({ id: doc.responsableId, name: doc.responsableName })
  }
  ;(doc.responsables || []).forEach(push)
  ;(doc.conductors || []).forEach(push)
  ;(doc.treballadors || []).forEach(push)

  const seenIds = new Set<string>()
  const seenNames = new Map<string, string | null>()
  return entries.filter((entry) => {
    const intervalKey = `${entry.startDate}|${entry.endDate}|${entry.startTime}|${entry.endTime}`
    const idKey = norm(entry.id)
    const nameKey = norm(entry.name)
    const idIntervalKey = `${idKey}|${intervalKey}`
    const nameIntervalKey = `${nameKey}|${intervalKey}`
    const previousIdForName = seenNames.get(nameIntervalKey)
    if (idKey) {
      if (seenIds.has(idIntervalKey) || previousIdForName === null) return false
      seenIds.add(idIntervalKey)
      if (previousIdForName === undefined) seenNames.set(nameIntervalKey, idKey)
      return true
    }
    if (seenNames.has(nameIntervalKey)) return false
    seenNames.set(nameIntervalKey, null)
    return true
  })
}

const toDates = (assignment: RangeAssignment) => {
  const start = new Date(`${assignment.startDate}T${assignment.startTime}:00`)
  let end = new Date(`${assignment.endDate}T${assignment.endTime}:00`)
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

const samePerson = (a: RangeAssignment, b: RangeAssignment) => {
  const aId = norm(a.id)
  const bId = norm(b.id)
  if (aId && bId) return aId === bId
  return Boolean(norm(a.name) && norm(a.name) === norm(b.name))
}

const reasonLabel = (reason: EligibilityReason) =>
  reason === 'overlap'
    ? 'se solapa amb una altra assignació'
    : reason === 'same_day_not_allowed'
      ? 'no pot fer dos serveis el mateix dia'
      : 'no compleix el descans mínim'

const validatePair = (
  requested: RangeAssignment,
  busy: RangeAssignment,
  rules: Awaited<ReturnType<typeof loadPersonnelRules>>
) => {
  if (!samePerson(requested, busy)) return null
  const req = toDates(requested)
  const occupied = toDates(busy)
  const result = evaluateRangeEligibility({
    reqStart: req.start,
    reqEnd: req.end,
    reqStartDate: requested.startDate,
    busyStart: occupied.start,
    busyEnd: occupied.end,
    busyStartDate: busy.startDate,
    ctx: rules,
  })
  return result.eligible ? null : result.reason
}

type BusyQuadrant = {
  collectionId: string
  docId: string
  data: DayReassignmentDocument
}

type DestinationAvailability = Record<
  string,
  { available: boolean; reason?: string }
>

const maintenanceAssignments = async (
  rangeStart: string,
  rangeEnd: string
): Promise<RangeAssignment[]> => {
  const assignments: RangeAssignment[] = []
  const [planned, tickets] = await Promise.all([
    db
      .collection('maintenancePreventiusPlanned')
      .where('date', '>=', rangeStart)
      .where('date', '<=', rangeEnd)
      .get()
      .catch(() => null),
    db
      .collection('maintenanceTickets')
      .where('plannedStart', '>=', new Date(`${rangeStart}T00:00:00Z`).getTime())
      .where('plannedStart', '<=', new Date(`${rangeEnd}T23:59:59Z`).getTime())
      .get()
      .catch(() => null),
  ])

  planned?.docs.forEach((snapshot) => {
    const data = snapshot.data() as {
      date?: string
      startTime?: string
      endTime?: string
      workerIds?: string[]
      workerNames?: string[]
    }
    const date = String(data.date || '').slice(0, 10)
    if (!date) return
    const ids = Array.isArray(data.workerIds) ? data.workerIds : []
    const names = Array.isArray(data.workerNames) ? data.workerNames : []
    const length = Math.max(ids.length, names.length)
    for (let index = 0; index < length; index += 1) {
      assignments.push({
        id: ids[index] || null,
        name: names[index] || null,
        startDate: date,
        endDate: date,
        startTime: String(data.startTime || '00:00').slice(0, 5),
        endTime: String(data.endTime || '23:59').slice(0, 5),
        sourceLabel: `preventiu de manteniment ${snapshot.id}`,
      })
    }
  })

  tickets?.docs.forEach((snapshot) => {
    const data = snapshot.data() as {
      plannedStart?: number
      plannedEnd?: number
      assignedToIds?: string[]
      assignedToNames?: string[]
    }
    const start = new Date(Number(data.plannedStart || 0))
    const end = new Date(Number(data.plannedEnd || 0))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
    const ids = Array.isArray(data.assignedToIds) ? data.assignedToIds : []
    const names = Array.isArray(data.assignedToNames) ? data.assignedToNames : []
    const length = Math.max(ids.length, names.length)
    for (let index = 0; index < length; index += 1) {
      assignments.push({
        id: ids[index] || null,
        name: names[index] || null,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        startTime: start.toISOString().slice(11, 16),
        endTime: end.toISOString().slice(11, 16),
        sourceLabel: `tiquet de manteniment ${snapshot.id}`,
      })
    }
  })

  return assignments
}

async function authorize(auth: Awaited<ReturnType<typeof requireAuth>>) {
  if (!auth.ok) return { ok: false as const, res: auth.res }
  const canView = await canViewUiPath({ user: auth.user, path: '/menu/quadrants' })
  const canSave = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: PERM.action('/menu/quadrants', 'draft:save'),
  })
  if (!canView || canSave !== true) {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }),
    }
  }
  return { ok: true as const, auth }
}

async function loadDayDocs(department: string, day: string) {
  const collectionId = await resolveQuadrantCollection(department, { prefer: 'singular' })
  const snapshots = await fetchQuadrantDocsByEndDate(collectionId, day, day)
  const docs = snapshots
    .map((snapshot) => ({
      id: snapshot.id,
      ref: snapshot.ref,
      data: snapshot.data() as DayReassignmentDocument,
    }))
    .filter(({ data }) => !isCancelled(data) && docTouchesDay(data, day))
  return { collectionId, docs }
}

export async function GET(req: NextRequest) {
  const authResult = await authorize(await requireAuth())
  if (!authResult.ok) return authResult.res

  const department = norm(req.nextUrl.searchParams.get('department'))
  const day = String(req.nextUrl.searchParams.get('day') || '').trim()
  if (!department || !ISO_DAY.test(day)) {
    return NextResponse.json({ ok: false, error: 'Paràmetres invàlids' }, { status: 400 })
  }

  const [{ collectionId, docs }, personnel, rules, collectionIds] = await Promise.all([
    loadDayDocs(department, day),
    loadDepartmentPersonnel(department),
    loadPersonnelRules(department),
    listOperationalQuadrantCollectionIds(),
  ])

  const rangeStart = addDays(day, -7)
  const rangeEnd = addDays(day, 7)
  const [snapshotsByCollection, maintenanceBusy] = await Promise.all([
    Promise.all(
      collectionIds.map(async (otherCollectionId) => ({
        collectionId: otherCollectionId,
        docs: await fetchQuadrantDocsByEndDate(otherCollectionId, rangeEnd, rangeStart),
      }))
    ),
    maintenanceAssignments(rangeStart, rangeEnd),
  ])
  const busyQuadrants: BusyQuadrant[] = snapshotsByCollection.flatMap(
    ({ collectionId: otherCollectionId, docs: otherDocs }) =>
      otherDocs
        .map((snapshot) => ({
          collectionId: otherCollectionId,
          docId: snapshot.id,
          data: snapshot.data() as DayReassignmentDocument,
        }))
        .filter(({ data }) => !isCancelled(data))
  )

  const availabilityFor = (
    person: Pick<DayReassignmentPerson, 'id' | 'name'>,
    sourceDocId: string | null
  ): DestinationAvailability =>
    Object.fromEntries(
      docs.map(({ id: destinationDocId, data: destinationData }) => {
        const requested = assignmentFromPerson(
          { id: person.id, name: person.name },
          destinationData,
          `${collectionId}/${destinationDocId}`
        )
        if (!requested) return [destinationDocId, { available: false }]

        const busyAssignments = busyQuadrants.flatMap((busyDoc) => {
          if (shouldIgnoreBusyQuadrantForMove({
            currentCollectionId: collectionId,
            busyCollectionId: busyDoc.collectionId,
            busyDocId: busyDoc.docId,
            sourceDocId,
            destinationDocId,
          })) {
            return []
          }
          return extractAssignments(
            busyDoc.data,
            `${busyDoc.collectionId}/${busyDoc.docId}`
          )
        })
        busyAssignments.push(...maintenanceBusy)
        const conflict = busyAssignments.find((busy) =>
          validatePair(requested, busy, rules)
        )
        const reason = conflict ? validatePair(requested, conflict, rules) : null
        return [
          destinationDocId,
          reason
            ? {
                available: false,
                reason: `${reasonLabel(reason)} (${conflict?.sourceLabel})`,
              }
            : { available: true },
        ]
      })
    )

  const assignedPersonKeys = new Set(
    docs.flatMap(({ data }) =>
      extractReassignableWorkers(data)
        .map((person) => reassignmentPersonKey(person.id, person.name))
        .filter(Boolean)
    )
  )

  return NextResponse.json({
    ok: true,
    day,
    department,
    quadrants: docs.map(({ id, data }) => ({
      docId: id,
      eventId: String(data.eventId || id),
      label: [
        String(data.eventName || data.code || data.eventId || id),
        norm(data.phaseLabel || data.phaseType) && norm(data.phaseLabel || data.phaseType) !== 'event'
          ? String(data.phaseLabel || data.phaseType)
          : '',
        data.startTime ? String(data.startTime).slice(0, 5) : '',
      ].filter(Boolean).join(' · '),
      status: String(data.status || 'draft'),
      workers: extractReassignableWorkers(data).map((person) => ({
        id: String(person.id || ''),
        name: String(person.name || ''),
        availability: availabilityFor(person, id),
      })),
    })),
    personnel: personnel
      .filter(
        (person) =>
          !assignedPersonKeys.has(reassignmentPersonKey(person.id, person.name))
      )
      .map((person) => ({
        id: person.id,
        name: person.name,
        availability: availabilityFor(person, null),
      })),
  })
}

export async function POST(req: NextRequest) {
  const authResult = await authorize(await requireAuth())
  if (!authResult.ok) return authResult.res

  const body = (await req.json()) as {
    department?: string
    day?: string
    operations?: DayReassignmentOperation[]
  }
  const department = norm(body.department)
  const day = String(body.day || '').trim()
  const operations = Array.isArray(body.operations)
    ? body.operations.filter(
        (operation) =>
          String(operation.personName || '').trim() &&
          operation.sourceDocId !== operation.destinationDocId
      )
    : []
  if (!department || !ISO_DAY.test(day) || operations.length === 0) {
    return NextResponse.json({ ok: false, error: 'No hi ha canvis per aplicar' }, { status: 400 })
  }

  const [{ collectionId, docs }, personnel] = await Promise.all([
    loadDayDocs(department, day),
    loadDepartmentPersonnel(department),
  ])
  const docsById = new Map(docs.map((entry) => [entry.id, entry]))
  const allowedPeople = new Set(
    personnel.flatMap((person) => [norm(person.id), norm(person.name)]).filter(Boolean)
  )
  docs.forEach(({ data }) => {
    extractReassignableWorkers(data).forEach((person) => {
      const key = reassignmentPersonKey(person.id, person.name)
      if (key) allowedPeople.add(key)
    })
  })

  for (const operation of operations) {
    if (operation.sourceDocId && !docsById.has(operation.sourceDocId)) {
      return NextResponse.json({ ok: false, error: 'El quadrant d’origen ja no existeix' }, { status: 409 })
    }
    if (operation.destinationDocId && !docsById.has(operation.destinationDocId)) {
      return NextResponse.json({ ok: false, error: 'El quadrant de destinació ja no existeix' }, { status: 409 })
    }
    if (!allowedPeople.has(reassignmentPersonKey(operation.personId, operation.personName))) {
      return NextResponse.json({ ok: false, error: 'Treballador no vàlid' }, { status: 400 })
    }
  }

  const changedDocIds = new Set(
    operations
      .flatMap((operation) => [operation.sourceDocId, operation.destinationDocId])
      .filter((value): value is string => Boolean(value))
  )
  const hasConfirmed = Array.from(changedDocIds).some(
    (docId) => norm(docsById.get(docId)?.data.status) === 'confirmed'
  )
  if (hasConfirmed) {
    const canReopen = await isAllowedByClientOverride({
      userId: authResult.auth.user.id,
      role: authResult.auth.user.role,
      permission: QUADRANTS_REOPEN_PERM,
    })
    if (canReopen !== true) {
      return NextResponse.json(
        { ok: false, error: 'Cal permís per reobrir els quadrants confirmats' },
        { status: 403 }
      )
    }
  }

  const finalDocs = new Map<string, DayReassignmentDocument>()
  docs.forEach(({ id, data }) => {
    if (!changedDocIds.has(id)) return
    finalDocs.set(id, { ...data, ...applyDayReassignmentOperations(id, data, operations) })
  })

  const rangeStart = addDays(day, -7)
  const rangeEnd = addDays(day, 7)
  const collectionIds = await listOperationalQuadrantCollectionIds()
  const [snapshotsByCollection, maintenanceBusy] = await Promise.all([
    Promise.all(
      collectionIds.map(async (otherCollectionId) => ({
        collectionId: otherCollectionId,
        docs: await fetchQuadrantDocsByEndDate(otherCollectionId, rangeEnd, rangeStart),
      }))
    ),
    maintenanceAssignments(rangeStart, rangeEnd),
  ])
  const busyAssignments: RangeAssignment[] = []
  snapshotsByCollection.forEach(({ collectionId: otherCollectionId, docs: otherDocs }) => {
    otherDocs.forEach((snapshot) => {
      if (otherCollectionId === collectionId && changedDocIds.has(snapshot.id)) return
      const data = snapshot.data() as DayReassignmentDocument
      if (isCancelled(data)) return
      busyAssignments.push(...extractAssignments(data, `${otherCollectionId}/${snapshot.id}`))
    })
  })
  busyAssignments.push(...maintenanceBusy)

  const finalAssignments = Array.from(finalDocs.entries()).flatMap(([docId, data]) =>
    extractAssignments(data, `${collectionId}/${docId}`)
  )
  const changedFinalAssignments = finalAssignments.filter((assignment) =>
    isPersonAffectedByReassignment(assignment, operations)
  )
  const rules = await loadPersonnelRules(department)

  for (const assignment of changedFinalAssignments) {
    for (const busy of busyAssignments) {
      const reason = validatePair(assignment, busy, rules)
      if (!reason) continue
      return NextResponse.json(
        {
          ok: false,
          error: `${assignment.name || assignment.id} no està disponible: ${reasonLabel(reason)} (${busy.sourceLabel}).`,
        },
        { status: 409 }
      )
    }
  }
  for (const assignment of changedFinalAssignments) {
    for (const otherAssignment of finalAssignments) {
      if (assignment === otherAssignment) continue
      const reason = validatePair(assignment, otherAssignment, rules)
      if (!reason) continue
      return NextResponse.json(
        {
          ok: false,
          error: `${assignment.name || assignment.id} no està disponible en el resultat final: ${reasonLabel(reason)}.`,
        },
        { status: 409 }
      )
    }
  }

  const batch = db.batch()
  finalDocs.forEach((data, docId) => {
    const patch = applyDayReassignmentOperations(docId, docsById.get(docId)!.data, operations)
    batch.set(
      docsById.get(docId)!.ref,
      { ...patch, status: 'draft', confirmedAt: null, confirmedBy: null, updatedAt: new Date() },
      { merge: true }
    )
  })
  await batch.commit()
  revalidateQuadrantsListCache()

  return NextResponse.json({ ok: true, updated: finalDocs.size })
}


import {
  fetchQuadrantDocsByEndDate,
  listQuadrantCollections,
  type QuadrantDoc,
} from '@/utils/personnelRest'

type AssignmentRef = {
  id?: string | null
  name?: string | null
  startDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
}

type BusySource = {
  collection: string
  docId: string
  eventId?: string | null
  status?: string | null
}

export type OverlapConflict = {
  personLabel: string
  personKey: string
  requested: {
    startDate: string
    endDate: string
    startTime: string
    endTime: string
  }
  busy: {
    startDate: string
    endDate: string
    startTime: string
    endTime: string
  }
  source: BusySource
}

type BusyLine = AssignmentRef & {
  source: BusySource
}

const norm = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const normalizeRange = (start: Date, end: Date) =>
  end <= start ? { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) } : { start, end }

const parseRange = (entry: AssignmentRef) => {
  const startDate = String(entry.startDate || '').trim()
  const endDate = String(entry.endDate || entry.startDate || '').trim()
  const startTime = String(entry.startTime || '00:00').trim() || '00:00'
  const endTime = String(entry.endTime || '23:59').trim() || '23:59'
  if (!startDate || !endDate) return null

  const start = new Date(`${startDate}T${startTime}:00`)
  const end = new Date(`${endDate}T${endTime}:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    ...normalizeRange(start, end),
  }
}

const pushBusyLine = (
  lines: BusyLine[],
  ref: AssignmentRef | null | undefined,
  base: QuadrantDoc,
  source: BusySource
) => {
  if (!ref) return
  const id = String(ref.id || '').trim()
  const name = String(ref.name || '').trim()
  if (!id && !name) return
  lines.push({
    id: id || null,
    name: name || null,
    startDate: String(ref.startDate || base.startDate || '').trim(),
    endDate: String(ref.endDate || base.endDate || base.startDate || '').trim(),
    startTime: String(ref.startTime || base.startTime || '00:00').trim() || '00:00',
    endTime: String(ref.endTime || base.endTime || '23:59').trim() || '23:59',
    source,
  })
}

const extractBusyLines = (
  doc: QuadrantDoc & { eventId?: string; status?: string },
  source: BusySource
) => {
  const lines: BusyLine[] = []
  pushBusyLine(lines, doc.responsable || null, doc, source)
  if (doc.responsableName) {
    pushBusyLine(lines, { name: doc.responsableName }, doc, source)
  }
  ;(doc.responsables || []).forEach((line) => pushBusyLine(lines, line, doc, source))
  ;(doc.conductors || []).forEach((line) => pushBusyLine(lines, line, doc, source))
  ;(doc.treballadors || []).forEach((line) => pushBusyLine(lines, line, doc, source))
  ;(doc.groups || []).forEach((group) =>
    pushBusyLine(
      lines,
      {
        id: group.responsibleId || null,
        name: group.responsibleName || null,
        startDate: group.startDate || doc.startDate,
        endDate: group.endDate || doc.endDate || doc.startDate,
        startTime: group.startTime || doc.startTime,
        endTime: group.endTime || doc.endTime,
      },
      doc,
      source
    )
  )
  return lines
}

export async function findQuadrantOverlapConflicts(params: {
  assignments: AssignmentRef[]
  excludeEventId?: string | null
  excludeDocIds?: string[]
}) {
  const excludeEventId = String(params.excludeEventId || '').trim()
  const excludeDocIds = new Set((params.excludeDocIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  const conflicts: OverlapConflict[] = []
  const seen = new Set<string>()
  const assignments = params.assignments.filter((assignment) => {
    const personKey = norm(assignment.id || assignment.name)
    if (!personKey) return false
    const range = parseRange(assignment)
    if (!range) return false
    const dedupeKey = `${personKey}|${range.startDate}|${range.endDate}|${range.startTime}|${range.endTime}`
    if (seen.has(dedupeKey)) return false
    seen.add(dedupeKey)
    return true
  })

  if (!assignments.length) return conflicts

  const startBound = assignments
    .map((assignment) => String(assignment.startDate || '').trim())
    .filter(Boolean)
    .sort()[0]
  const endBound = assignments
    .map((assignment) => String(assignment.endDate || assignment.startDate || '').trim())
    .filter(Boolean)
    .sort()
    .slice(-1)[0]

  if (!startBound || !endBound) return conflicts

  const collectionIds = await listQuadrantCollections()
  for (const collectionId of collectionIds) {
    const docs = await fetchQuadrantDocsByEndDate(collectionId, endBound, startBound)
    for (const docSnap of docs) {
      if (excludeDocIds.has(docSnap.id)) continue
      const doc = docSnap.data() as QuadrantDoc & { eventId?: string; status?: string }
      if (excludeEventId && String(doc?.eventId || '').trim() === excludeEventId) continue

      const source: BusySource = {
        collection: collectionId,
        docId: docSnap.id,
        eventId: String(doc?.eventId || '').trim() || null,
        status: String(doc?.status || '').trim() || null,
      }
      const busyLines = extractBusyLines(doc, source)
      for (const assignment of assignments) {
        const personKey = norm(assignment.id || assignment.name)
        if (!personKey) continue
        const requested = parseRange(assignment)
        if (!requested) continue

        for (const busyLine of busyLines) {
          if (norm(busyLine.id || busyLine.name) !== personKey) continue
          const busy = parseRange(busyLine)
          if (!busy) continue
          const overlap = requested.start < busy.end && requested.end > busy.start
          if (!overlap) continue

          conflicts.push({
            personLabel: String(assignment.name || assignment.id || '').trim() || personKey,
            personKey,
            requested: {
              startDate: requested.startDate,
              endDate: requested.endDate,
              startTime: requested.startTime,
              endTime: requested.endTime,
            },
            busy: {
              startDate: busy.startDate,
              endDate: busy.endDate,
              startTime: busy.startTime,
              endTime: busy.endTime,
            },
            source,
          })
        }
      }
    }
  }

  return conflicts
}

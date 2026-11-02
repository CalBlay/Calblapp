import {
  fetchQuadrantDocsByEndDate,
  type QuadrantDoc,
} from '@/utils/personnelRest'
import { getQuadrantOverlapCacheGeneration } from '@/lib/quadrantOverlapCacheState'
import { collectQuadrantLinePersonnel } from '@/lib/quadrantLinePersonnel'

const BUSY_DOCS_CACHE_TTL_MS = 90_000
const busyDocsCache = new Map<
  string,
  { snapshot: OverlapBusySnapshot; ts: number; generation: number }
>()

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

const extractBusyLines = (
  doc: QuadrantDoc & { eventId?: string; status?: string },
  source: BusySource
) => {
  return collectQuadrantLinePersonnel(doc).map(
    (person): BusyLine => ({
      id: person.id || null,
      name: person.name || null,
      startDate: person.startDate,
      endDate: person.endDate,
      startTime: person.startTime,
      endTime: person.endTime,
      source,
    })
  )
}

export type OverlapBusySnapshot = Array<{
  collectionId: string
  docId: string
  doc: QuadrantDoc & { eventId?: string; status?: string }
}>

export async function preloadQuadrantOverlapBusyDocs(
  startBound: string,
  endBound: string,
  options?: { department?: string }
): Promise<OverlapBusySnapshot> {
  const start = String(startBound || '').trim()
  const end = String(endBound || '').trim()
  if (!start || !end) return []

  const deptKey = options?.department ? norm(options.department) : ''
  const cacheKey = deptKey ? `${start}|${end}|${deptKey}` : `${start}|${end}`
  const now = Date.now()
  const generation = getQuadrantOverlapCacheGeneration()
  const cached = busyDocsCache.get(cacheKey)
  if (
    cached &&
    cached.generation === generation &&
    now - cached.ts < BUSY_DOCS_CACHE_TTL_MS
  ) {
    return cached.snapshot
  }

  const { listOperationalQuadrantCollectionIds, resolveQuadrantCollection } = await import(
    '@/lib/firestoreCollections'
  )
  const collectionIds = deptKey
    ? [await resolveQuadrantCollection(deptKey, { prefer: 'singular' })]
    : await listOperationalQuadrantCollectionIds()
  const snapshots = await Promise.all(
    collectionIds.map(async (collectionId) => {
      const docs = await fetchQuadrantDocsByEndDate(collectionId, end, start)
      return docs.map((docSnap) => ({
        collectionId,
        docId: docSnap.id,
        doc: docSnap.data() as QuadrantDoc & { eventId?: string; status?: string },
      }))
    })
  )
  const snapshot = snapshots.flat()
  busyDocsCache.set(cacheKey, { snapshot, ts: now, generation })
  return snapshot
}

function findQuadrantOverlapConflictsFromBusyDocs(
  params: {
    assignments: AssignmentRef[]
    excludeEventId?: string | null
    excludeDocIds?: string[]
  },
  busyDocs: OverlapBusySnapshot
): OverlapConflict[] {
  const excludeEventId = String(params.excludeEventId || '').trim()
  const excludeDocIds = new Set(
    (params.excludeDocIds || []).map((id) => String(id || '').trim()).filter(Boolean)
  )
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

  for (const { collectionId, docId, doc } of busyDocs) {
    if (excludeDocIds.has(docId)) continue
    if (excludeEventId && String(doc?.eventId || '').trim() === excludeEventId) continue

    const source: BusySource = {
      collection: collectionId,
      docId,
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

  return conflicts
}

export async function findQuadrantOverlapConflicts(params: {
  assignments: AssignmentRef[]
  excludeEventId?: string | null
  excludeDocIds?: string[]
  preloadedBusyDocs?: OverlapBusySnapshot
}) {
  const assignments = params.assignments.filter((assignment) => {
    const personKey = norm(assignment.id || assignment.name)
    if (!personKey) return false
    return Boolean(parseRange(assignment))
  })

  if (!assignments.length) return []

  const startBound = assignments
    .map((assignment) => String(assignment.startDate || '').trim())
    .filter(Boolean)
    .sort()[0]
  const endBound = assignments
    .map((assignment) => String(assignment.endDate || assignment.startDate || '').trim())
    .filter(Boolean)
    .sort()
    .slice(-1)[0]

  if (!startBound || !endBound) return []

  const busyDocs =
    params.preloadedBusyDocs ??
    (await preloadQuadrantOverlapBusyDocs(startBound, endBound))

  return findQuadrantOverlapConflictsFromBusyDocs(params, busyDocs)
}

import {
  findQuadrantOverlapConflicts,
  preloadQuadrantOverlapBusyDocs,
  type OverlapBusySnapshot,
} from '@/lib/quadrantOverlapGuard'
import type { QuadrantSave } from '@/lib/quadrantsPost/types'

export function extractOverlapAssignmentsFromQuadrantSave(doc: QuadrantSave) {
  const assignments: Array<{
    id?: string | null
    name?: string | null
    startDate: string
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
  }> = []
  const push = (entry: {
    id?: string | null
    name?: string | null
    startDate?: string | null
    endDate?: string | null
    startTime?: string | null
    endTime?: string | null
  }) => {
    const id = String(entry.id || '').trim()
    const name = String(entry.name || '').trim()
    const startDate = String(entry.startDate || doc.startDate || '').trim()
    const endDate = String(entry.endDate || doc.endDate || startDate).trim()
    const startTime = String(entry.startTime || doc.startTime || '00:00').trim() || '00:00'
    const endTime = String(entry.endTime || doc.endTime || '23:59').trim() || '23:59'
    if ((!id && !name) || !startDate || !endDate) return
    assignments.push({ id: id || null, name: name || null, startDate, endDate, startTime, endTime })
  }

  push({
    name: doc.responsableName || doc.responsable?.name || null,
    startDate: doc.startDate,
    endDate: doc.endDate,
    startTime: doc.startTime,
    endTime: doc.endTime,
  })
  ;(doc.conductors || []).forEach((line) => push(line))
  ;(doc.treballadors || []).forEach((line) => push(line))
  ;(doc.groups || []).forEach((group) =>
    push({
      id: group.responsibleId || null,
      name: group.responsibleName || null,
      startDate: (group as { serviceDate?: string | null }).serviceDate || doc.startDate,
      endDate: (group as { serviceDate?: string | null }).serviceDate || doc.endDate || doc.startDate,
      startTime: group.startTime || doc.startTime,
      endTime: group.endTime || doc.endTime,
    })
  )

  return assignments
}

export function createOverlapGuard(
  overlapStartBound: string,
  overlapEndBound: string,
  overlapWarmupPromise: Promise<OverlapBusySnapshot> | null
) {
  let overlapBusyDocsCache: OverlapBusySnapshot | null = null
  let warmupPromise = overlapWarmupPromise

  const getOverlapBusyDocs = async (startBound: string, endBound: string) => {
    if (overlapBusyDocsCache) return overlapBusyDocsCache
    if (warmupPromise) {
      overlapBusyDocsCache = await warmupPromise
      warmupPromise = null
      return overlapBusyDocsCache
    }
    overlapBusyDocsCache = await preloadQuadrantOverlapBusyDocs(startBound, endBound)
    return overlapBusyDocsCache
  }

  const ensureNoOverlapForQuadrantSave = async (doc: QuadrantSave, excludeDocIds: string[] = []) => {
    const assignments = extractOverlapAssignmentsFromQuadrantSave(doc)
    const startBound = assignments
      .map((assignment) => String(assignment.startDate || '').trim())
      .filter(Boolean)
      .sort()[0]
    const endBound = assignments
      .map((assignment) => String(assignment.endDate || assignment.startDate || '').trim())
      .filter(Boolean)
      .sort()
      .slice(-1)[0]
    const preloadedBusyDocs =
      startBound && endBound ? await getOverlapBusyDocs(startBound, endBound) : undefined

    const conflicts = await findQuadrantOverlapConflicts({
      assignments,
      excludeEventId: String(doc.eventId || '').trim(),
      excludeDocIds,
      preloadedBusyDocs,
    })
    if (conflicts.length === 0) return

    const first = conflicts[0]
    const message = `Solapament de personal no permès: ${first.personLabel} ja està assignat a ${first.source.eventId || first.source.docId} (${first.busy.startDate} ${first.busy.startTime}-${first.busy.endTime}).`
    const error = new Error(message)
    ;(error as Error & { status?: number; conflicts?: unknown }).status = 409
    ;(error as Error & { status?: number; conflicts?: unknown }).conflicts = conflicts
    throw error
  }

  return { getOverlapBusyDocs, ensureNoOverlapForQuadrantSave }
}

import {
  findQuadrantOverlapConflicts,
  preloadQuadrantOverlapBusyDocs,
  type OverlapBusySnapshot,
} from '@/lib/quadrantOverlapGuard'
import type { QuadrantSave } from '@/lib/quadrantsPost/types'
import { collectQuadrantLinePersonnel } from '@/lib/quadrantLinePersonnel'

export function extractOverlapAssignmentsFromQuadrantSave(doc: QuadrantSave) {
  return collectQuadrantLinePersonnel(doc).map((person) => ({
    id: person.id || null,
    name: person.name || null,
    startDate: person.startDate,
    endDate: person.endDate,
    startTime: person.startTime,
    endTime: person.endTime,
  }))
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

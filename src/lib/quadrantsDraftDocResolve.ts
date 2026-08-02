/**
 * Resolve the Firestore document id for single-doc department draft saves
 * (Cuina / Logistica) after the drafts list rewrites card ids to the
 * canonical event id via aggregateDrafts.
 *
 * Multi-day Cuina docs are stored as:
 *   `${eventId}__event__${YYYY-MM-DD}__event`
 * Saving against the bare event id would create/update a phantom doc and
 * leave the real day doc unchanged.
 */

export type DraftDocCandidate = {
  id: string
  phaseDate?: string | null
  startDate?: string | null
}

export function parseDraftDocIdDate(docId: string): string {
  const parts = String(docId || '')
    .trim()
    .split('__')
  if (parts.length < 3) return ''
  const candidate = String(parts[2] || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : ''
}

export function resolveDraftDocDate(
  doc: DraftDocCandidate | null | undefined
): string {
  if (!doc) return ''
  const fromFields = String(doc.phaseDate || doc.startDate || '').trim()
  if (fromFields) return fromFields.slice(0, 10)
  return parseDraftDocIdDate(doc.id)
}

export function buildCuinaDayDocId(canonicalEventId: string, phaseDate: string): string {
  const eventId = String(canonicalEventId || '').trim()
  const date = String(phaseDate || '').trim().slice(0, 10)
  return `${eventId}__event__${date || 'nodate'}__event`
}

/**
 * Pick the Firestore doc id that a drafts-list save should write to.
 */
export function resolveGroupedDraftTargetDocId(params: {
  sourceDocId?: string | null
  canonicalEventId: string
  phaseDate?: string | null
  startDate?: string | null
  existingDocs?: DraftDocCandidate[]
}): string {
  const canonicalEventId = String(params.canonicalEventId || '').trim()
  const sourceDocId = String(params.sourceDocId || '').trim()
  const requestedDate = String(params.phaseDate || params.startDate || '')
    .trim()
    .slice(0, 10)
  const existingDocs = Array.isArray(params.existingDocs) ? params.existingDocs : []

  // Caller already has a compound / concrete doc id (quadrant editor, etc.).
  if (sourceDocId.includes('__')) {
    return sourceDocId
  }

  if (requestedDate) {
    const dateMatches = existingDocs.filter(
      (doc) => resolveDraftDocDate(doc) === requestedDate
    )

    if (dateMatches.length > 0) {
      const compoundMatch = dateMatches.find((doc) => String(doc.id).includes('__'))
      return String((compoundMatch || dateMatches[0]).id)
    }

    const legacyCanonical = existingDocs.find(
      (doc) => String(doc.id).trim() === canonicalEventId
    )
    if (legacyCanonical) {
      return canonicalEventId
    }

    // No existing day doc yet — keep the single-flow id shape used by Cuina.
    return buildCuinaDayDocId(canonicalEventId, requestedDate)
  }

  if (sourceDocId) return sourceDocId
  return canonicalEventId
}

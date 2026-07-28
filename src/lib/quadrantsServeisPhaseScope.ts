/**
 * Phase/date scoping for Serveis multi-quadrant docs.
 * Docs are stored as `${eventId}__${phaseKey}__${date}__${groupId}` with
 * matching `phaseType` / `phaseLabel` / `startDate` fields.
 */

export type ServeisPhaseScope = {
  /** Token used in Firestore document ids (label preferred, else type). */
  phaseKey: string
  /** Acceptable phase tokens for matching existing docs. */
  phaseTokens: string[]
  /** YYYY-MM-DD when known; empty means date is unconstrained. */
  phaseDate: string
}

export function normalizePhaseToken(value?: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function resolveServeisPhaseScope(
  docMeta?: Record<string, unknown> | null
): ServeisPhaseScope {
  const phaseType = normalizePhaseToken(docMeta?.phaseType) || 'event'
  const phaseLabel = normalizePhaseToken(docMeta?.phaseLabel)
  const phaseKey = phaseLabel || phaseType || 'event'
  const phaseDate = String(docMeta?.phaseDate || docMeta?.startDate || '').trim()
  const phaseTokens = Array.from(
    new Set([phaseType, phaseLabel, phaseKey].filter(Boolean))
  )
  return { phaseKey, phaseTokens, phaseDate }
}

export function parseServeisDocIdParts(docId: string): {
  eventId: string
  phaseKey: string
  phaseDate: string
  groupId: string
} | null {
  const parts = String(docId || '')
    .trim()
    .split('__')
  if (parts.length < 4) return null
  return {
    eventId: parts[0],
    phaseKey: normalizePhaseToken(parts[1]),
    phaseDate: String(parts[2] || '').trim(),
    groupId: parts.slice(3).join('__'),
  }
}

export function docMatchesServeisPhaseScope(
  docId: string,
  data: Record<string, unknown> | null | undefined,
  scope: ServeisPhaseScope
): boolean {
  const parsed = parseServeisDocIdParts(docId)
  const dataTokens = [data?.phaseKey, data?.phaseType, data?.phaseLabel, parsed?.phaseKey]
    .map(normalizePhaseToken)
    .filter(Boolean)

  // Legacy docs without phase markers are treated as the event phase.
  const effectiveTokens = dataTokens.length > 0 ? dataTokens : ['event']
  const matchesPhase = effectiveTokens.some((token) => scope.phaseTokens.includes(token))
  if (!matchesPhase) return false

  if (!scope.phaseDate) return true

  const docDate =
    String(data?.phaseDate || data?.startDate || '').trim() || parsed?.phaseDate || ''
  if (!docDate) return true
  return docDate === scope.phaseDate
}

export function buildServeisPhaseDocId({
  canonicalEventId,
  phaseKey,
  phaseDate,
  groupId,
}: {
  canonicalEventId: string
  phaseKey: string
  phaseDate: string
  groupId: string
}): string {
  const sanitize = (value: string) =>
    String(value || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '') || 'group'
  return `${canonicalEventId}__${sanitize(phaseKey) || 'event'}__${
    phaseDate || 'nodate'
  }__${sanitize(groupId)}`
}

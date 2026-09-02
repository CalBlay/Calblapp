export type ServeisPhaseLabelSource = {
  dateLabel?: string | null
  phaseKey?: string | null
  phaseType?: string | null
  serviceDate?: string | null
}

/** Local normalize to keep this helper free of firebaseAdmin / server-only imports. */
const phaseKeyNorm = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

/**
 * Resolve the Serveis phase display label used for Firestore doc ids
 * (`{eventId}__{norm(label)}__{date}__{groupId}`).
 *
 * Prefer an explicit dateLabel, then the UI phaseKey/phaseType. Only fall back to
 * the date heuristic when neither is present — otherwise same-day Muntatge is
 * mislabeled as Event and phaseWriter prefix cleanup can delete real Event docs.
 */
export function resolveServeisGroupPhaseLabel(
  group: ServeisPhaseLabelSource,
  eventDate?: string | null
): string {
  const fromDateLabel = String(group?.dateLabel || '').trim()
  if (fromDateLabel) return fromDateLabel

  const fromPhase = String(group?.phaseKey || group?.phaseType || '').trim()
  if (fromPhase) {
    const key = phaseKeyNorm(fromPhase)
    if (key === 'event') return 'Event'
    if (key === 'muntatge') return 'Muntatge'
    return fromPhase.charAt(0).toUpperCase() + fromPhase.slice(1)
  }

  const serviceDate = String(group?.serviceDate || eventDate || '').trim()
  const startDate = String(eventDate || '').trim()
  return serviceDate && startDate && serviceDate === startDate ? 'Event' : 'Muntatge'
}

export function isExcludedVehicleAvailabilityQuadrant(
  quadrant: { docId?: string | null; eventId?: string | null },
  excludeEventId?: string | null
): boolean {
  const excluded = String(excludeEventId || '').trim()
  if (!excluded) return false

  const docId = String(quadrant.docId || '').trim()
  const eventId = String(quadrant.eventId || '').trim()
  return docId === excluded || docId.startsWith(`${excluded}__`) || eventId === excluded
}

/**
 * Events list scoping: workers without events edit still only see assigned events.
 * Production operational workers and anyone with full events access see the full list.
 */
export function shouldRestrictEventsListToOwnAssignments(params: {
  role?: string | null
  isProductionOperationalWorker: boolean
  hasFullEventsAccess: boolean
}): boolean {
  const role = String(params.role || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  return (
    role === 'treballador' &&
    !params.isProductionOperationalWorker &&
    !params.hasFullEventsAccess
  )
}

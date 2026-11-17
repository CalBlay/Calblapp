const LOCATION_ACCOUNT_PREFIX =
  /^(?:zz\s*)?(?:restaurant|restauracio|restauraci[oó]|empresa|empreses|casament|casaments)\b[\s:·|/\\\-–—]*/i

function foldLocation(value: unknown): string {
  const folded = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

  // Àlies i nom comercial utilitzats entre Restaurant, Empresa i Casaments.
  if (
    folded === 'fdlc' ||
    folded === 'fontdelacanya' ||
    folded === 'hotelboutiquefontdelacanya'
  ) {
    return 'fontdelacanya'
  }
  if (
    folded === 'soliver' ||
    folded === 'sesoliveres' ||
    folded === 'restaurantsoliver' ||
    folded === 'retaurantsoliver'
  ) {
    return 'sesoliveres'
  }
  return folded
}

export function stripEventLocationAccountPrefix(value: unknown): string {
  return String(value || '').trim().replace(LOCATION_ACCOUNT_PREFIX, '').trim()
}

/**
 * Els comptes genèrics de centre (p. ex. "Restaurant Font de la Canya")
 * conserven un àmbit per ubicació encara que tinguin permís d'edició d'events.
 */
export function resolveEventLocationScope(params: {
  userName?: string | null
  role?: string | null
  department?: string | null
}): string | null {
  const userName = String(params.userName || '').trim()
  if (!userName) return null

  const withoutPrefix = stripEventLocationAccountPrefix(userName)
  const hasLocationPrefix = withoutPrefix !== userName
  if (hasLocationPrefix) return withoutPrefix || null

  const role = foldLocation(params.role)
  const department = foldLocation(params.department)
  const isExternalLocationUser =
    role === 'usuari' &&
    ['restaurant', 'restauracio', 'empresa', 'empreses', 'casament', 'casaments'].some(
      (key) => department.includes(key)
    )

  return isExternalLocationUser ? userName : null
}

/** Coincidència exacta tolerant a accents, majúscules i prefixos de línia de negoci. */
export function eventLocationMatchesScope(
  eventLocation: unknown,
  locationScope: unknown
): boolean {
  const eventKey = foldLocation(stripEventLocationAccountPrefix(eventLocation))
  const scopeKey = foldLocation(stripEventLocationAccountPrefix(locationScope))
  return Boolean(eventKey && scopeKey && eventKey === scopeKey)
}

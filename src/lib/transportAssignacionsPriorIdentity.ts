type ConductorIdentity = {
  name?: string
  plate?: string
}

export function normalizeAssignacionsName(s?: string | null): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function normalizeAssignacionsPlate(s?: string | null): string {
  return String(s || '').trim().toUpperCase()
}

/** Mateixa persona “antiga” que `priorConductor` (per treure duplicats a conductors). */
export function matchesPriorConductorIdentity(
  row: ConductorIdentity,
  prior: ConductorIdentity | undefined,
  plateNorm: (s?: string | null) => string = normalizeAssignacionsPlate
): boolean {
  if (!prior) return false
  const pn = normalizeAssignacionsName(prior.name)
  const pp = plateNorm(prior.plate)
  if (!pn && !pp) return false
  const cn = normalizeAssignacionsName(row.name)
  const cp = plateNorm(row.plate)
  if (pn && pp) return cn === pn && cp === pp
  if (pn) return cn === pn
  return cp === pp
}

/**
 * El filtre de duplicats només s’ha d’aplicar quan es canvia de conductor/matrícula.
 * Si es desa la mateixa identitat (p. ex. només l’hora), treure `prior` esborraria
 * la fila que acabem de substituir.
 */
export function shouldStripPriorConductorDuplicates(params: {
  isExplicitEdit: boolean
  replaced: boolean
  priorConductor?: ConductorIdentity
  next?: ConductorIdentity
  plateNorm?: (s?: string | null) => string
}): boolean {
  if (!params.isExplicitEdit || !params.replaced || !params.priorConductor) return false
  const plateNorm = params.plateNorm ?? normalizeAssignacionsPlate
  return !matchesPriorConductorIdentity(
    params.next || {},
    params.priorConductor,
    plateNorm
  )
}

export function stripPriorConductorDuplicates<T extends ConductorIdentity>(
  list: T[],
  prior: ConductorIdentity,
  plateNorm: (s?: string | null) => string = normalizeAssignacionsPlate
): T[] {
  return list.filter((row) => !matchesPriorConductorIdentity(row, prior, plateNorm))
}

/** Clau normalitzada per deduplicar etiquetes (sense accents, minúscules). */
export function normalizeDepartmentLabel(value?: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .toLowerCase()
    .trim()
}

function dedupeDepartmentLabels(labels: readonly string[]): string[] {
  const map = new Map<string, string>()
  for (const label of labels) {
    const trimmed = String(label || '').trim()
    if (!trimmed) continue
    const key = normalizeDepartmentLabel(trimmed)
    if (!key || map.has(key)) continue
    map.set(key, trimmed)
  }
  return [...map.values()]
}

/** Ordenació alfabètica en català (departaments, etiquetes…). */
export function sortDepartmentLabels(labels: readonly string[]): string[] {
  return [...labels].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

const DEPARTMENTS_RAW = [
  'Empresa',
  'Compres',
  'Comptabilitat',
  'Administracio',
  'Direccio',
  'Delsys',
  'Restauracio',
  'Marqueting',
  'Manteniment',
  'Decoracio',
  'Plats Preparats',
  'Recursos Humans',
  'Serveis',
  'Logistica',
  'Cuina',
  'Cuina Central',
  'Food Lover',
  'FDLC',
  'Qualitat',
  'Produccio',
  'Casaments',
  'Transports',
  'Agenda',
] as const

export type DepartmentId = (typeof DEPARTMENTS_RAW)[number]

export const DEPARTMENTS = sortDepartmentLabels(
  dedupeDepartmentLabels(DEPARTMENTS_RAW)
) as readonly DepartmentId[]

/** Departament per defecte en formularis nous. */
export const DEFAULT_USER_DEPARTMENT = 'Empresa' as DepartmentId

/**
 * Opcions de departament per selects d'usuari: sense duplicats (p.ex. amb/sense accent),
 * ordenades alfabèticament en català.
 */
export function getUserDepartmentSelectOptions(...extras: (string | undefined)[]): string[] {
  const map = new Map<string, string>()
  for (const dep of DEPARTMENTS) {
    const key = normalizeDepartmentLabel(dep)
    if (!key || map.has(key)) continue
    map.set(key, dep)
  }
  for (const extra of extras) {
    const trimmed = String(extra || '').trim()
    if (!trimmed || trimmed === '-') continue
    const key = normalizeDepartmentLabel(trimmed)
    if (!key || map.has(key)) continue
    const canonical = DEPARTMENTS.find((d) => normalizeDepartmentLabel(d) === key)
    map.set(key, canonical ?? trimmed)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

/**
 * Departaments permesos per classificar productes de roba (checkboxes al catàleg).
 * No substitueix {@link DEPARTMENTS} (treballadors, sol·licituds, etc.).
 */
export const ROBA_PRODUCT_DEPARTMENTS = [
  'Restauracio',
  'Manteniment',
  'Decoracio',
  'Serveis',
  'Cuina Central',
  'Logistica',
  'Foodlovers',
  'FDLC',
  'Transport',
] as const

export type RobaProductDepartmentId = (typeof ROBA_PRODUCT_DEPARTMENTS)[number]

/** Només conserva valors de {@link ROBA_PRODUCT_DEPARTMENTS} (ordre estable segons la llista). */
export function normalizeRobaProductDepartments(input: string[]): string[] {
  const wanted = new Set(input.map((s) => s.trim()).filter(Boolean))
  return ROBA_PRODUCT_DEPARTMENTS.filter((d) => wanted.has(d))
}

const ROBA_PRODUCT_DEPARTMENT_SET = new Set<string>(ROBA_PRODUCT_DEPARTMENTS)

/** Departament vàlid per a productes i treballadors del mòdul Roba personal. */
export function isRobaProductDepartmentValue(v: string): boolean {
  return ROBA_PRODUCT_DEPARTMENT_SET.has(String(v ?? '').trim())
}

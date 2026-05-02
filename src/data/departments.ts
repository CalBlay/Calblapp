export const DEPARTMENTS = [
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
] as const

export type DepartmentId = (typeof DEPARTMENTS)[number]

/** Departament per defecte en formularis nous (primer de la llista). */
export const DEFAULT_USER_DEPARTMENT = DEPARTMENTS[0]

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

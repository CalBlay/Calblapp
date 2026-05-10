/**
 * Comparació de departaments per a àmbit de responsables de roba (sense dependències de servidor).
 * Permet alinear p. ex. «Cuina» (usuari) amb «Cuina Central» (etiqueta de producte / treballador).
 */

import { ROBA_PRODUCT_DEPARTMENTS } from '@/data/departments'

export function normDeptLabel(s: string | undefined | null): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Grups de departaments que comparteixen àmbit de roba per al mateix cap de departament. */
const ROBA_DEPT_EQUIVALENCE: string[][] = [['cuina', 'cuina central']]

/**
 * Valors de `normDeptLabel` a usar en queries Firestore `in` per un cap de departament
 * (inclou tot el grup d’equivalència, p. ex. cuina + cuina central).
 */
export function normDeptLabelsInRobaEquivalenceClass(leadDeptNorm: string): string[] {
  const l = normDeptLabel(leadDeptNorm)
  if (!l) return []
  for (const g of ROBA_DEPT_EQUIVALENCE) {
    const norms = g.map((x) => normDeptLabel(x))
    if (norms.some((x) => x === l)) {
      return [...new Set(norms)]
    }
  }
  return [l]
}

export function departmentsInSameRobaScope(a: string, b: string): boolean {
  const na = normDeptLabel(a)
  const nb = normDeptLabel(b)
  if (!na || !nb) return false
  if (na === nb) return true
  for (const g of ROBA_DEPT_EQUIVALENCE) {
    if (g.includes(na) && g.includes(nb)) return true
  }
  return false
}

/** Producte visible per al cap si no té restricció o alguna etiqueta cau dins del mateix àmbit que el cap. */
export function productDepartmentsVisibleToRobaLead(
  productDepartments: string[] | null | undefined,
  leadDeptNorm: string
): boolean {
  const tags = productDepartments?.map((t) => String(t || '').trim()).filter(Boolean) ?? []
  if (tags.length === 0) return true
  const l = normDeptLabel(leadDeptNorm)
  if (!l) return false
  return tags.some((t) => departmentsInSameRobaScope(t, l))
}

/**
 * Valors literals del camp `departments` dels productes a Firestore (catàleg roba).
 * Cal usar-los a `array-contains-any`: no valen les etiquetes normalitzades retornades per
 * {@link normDeptLabelsInRobaEquivalenceClass} (minúscules), perquè el magatzem guarda els
 * strings canònics de {@link ROBA_PRODUCT_DEPARTMENTS}.
 */
export function robaProductDepartmentTagsForFirestoreQuery(leadDeptNorm: string): string[] {
  const l = normDeptLabel(leadDeptNorm)
  if (!l) return []
  const tags = ROBA_PRODUCT_DEPARTMENTS.filter((tag) => departmentsInSameRobaScope(tag, l))
  return [...new Set(tags)]
}

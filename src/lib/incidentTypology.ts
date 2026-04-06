/**
 * Tipologies d’incidència — **punt únic per a tota l’app** (API, pantalla de tipologies, merge amb Firestore).
 *
 * Dades per defecte (editable en repositori):
 * - `src/data/incident-categories.json` — codis i etiquetes de cada tipologia
 * - `src/data/incident-category-families.json` — noms dels grups per prefix (2XX, 4XX, …)
 *
 * No dupliquis aquests llistats en altres fitxers; importa des d’aquí o usa les APIs `/api/incidents/categories` i `/api/incidents/category-families`.
 *
 * (Estil de text de la UI: mides, pesos — vegeu `typography.ts`, no aquest fitxer.)
 */
import defaultIncidentCategories from '@/data/incident-categories.json'
import defaultFamilyLabels from '@/data/incident-category-families.json'

export type IncidentCategoryDefault = { id: string; label: string }

export const DEFAULT_INCIDENT_CATEGORIES: IncidentCategoryDefault[] =
  defaultIncidentCategories as IncidentCategoryDefault[]

export const DEFAULT_INCIDENT_FAMILY_LABELS: Record<string, string> = {
  ...(defaultFamilyLabels as Record<string, string>),
}

export function normalizeFamilyPrefix(raw: string): string | null {
  const d = raw.trim().charAt(0)
  if (!d) return null
  if (!/^[0-9]$/.test(d)) return null
  return d
}

export function mergeFamilyLabels(
  firestoreLabels: Record<string, unknown> | undefined | null
): Record<string, string> {
  const out = { ...DEFAULT_INCIDENT_FAMILY_LABELS }
  if (!firestoreLabels || typeof firestoreLabels !== 'object') return out
  for (const [k, v] of Object.entries(firestoreLabels)) {
    const prefix = normalizeFamilyPrefix(k)
    if (!prefix) continue
    if (typeof v === 'string' && v.trim()) out[prefix] = v.trim()
  }
  return out
}

export function familyLabelForCategoryId(
  categoryId: string,
  families: Record<string, string>
): string {
  const prefix = normalizeFamilyPrefix(categoryId || '')
  if (!prefix) return '—'
  return families[prefix] ?? `Grup ${prefix}XX`
}

// filename: src/lib/firestoreCollections.ts
/**
 * Cache compartit de la llista de col·leccions de Firestore.
 *
 * Motivacio: `firestoreAdmin.listCollections()` es una crida cara
 * (round-trip + iteracio sobre totes les col·leccions del projecte) i es
 * cridava en 10+ punts del codi, sovint sense cache. Aquest modul
 * memoritza el resultat amb TTL i centralitza els helpers de resolucio
 * de col·leccions per departament.
 *
 * Les col·leccions noves de quadrants es creen molt rarament (un cop
 * per departament nou), aixi que un TTL de 5 min es segur.
 */
import { firestoreAdmin } from '@/lib/firebaseAdmin'

const TTL_MS = 5 * 60_000
let cache: { ids: string[]; ts: number } | null = null
let inflight: Promise<string[]> | null = null

const norm = (s?: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * Retorna tots els collection IDs del projecte. Cachejat 5 min.
 * Si hi ha una request inflight, reutilitza la promise per evitar
 * crides duplicades.
 */
export async function listAllCollectionIds(): Promise<string[]> {
  const now = Date.now()
  if (cache && now - cache.ts < TTL_MS) return cache.ids
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const cols = await firestoreAdmin.listCollections()
      const ids = cols.map((c) => c.id)
      cache = { ids, ts: Date.now() }
      return ids
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Invalida manualment el cache (p. ex. despres de crear una col·leccio
 * nova durant un POST). Tambe es pot deixar caducar pel TTL.
 */
export function invalidateCollectionsCache() {
  cache = null
}

/**
 * Retorna nomes col·leccions de quadrants (`quadrants*`), sense
 * variants de borrador (`*draft*`).
 */
export async function listQuadrantCollectionIds(
  options?: { includeDrafts?: boolean }
): Promise<string[]> {
  const ids = await listAllCollectionIds()
  return ids.filter((id) => {
    const n = norm(id)
    if (!n.startsWith('quadrant')) return false
    if (!options?.includeDrafts && n.includes('draft')) return false
    return true
  })
}

/**
 * Resol el nom real de la col·leccio per un departament. Suporta
 * tant `quadrants{Dept}` (plural) com `quadrant{Dept}` (singular).
 * Per defecte prioritza la variant singular si existeix (cas legacy
 * actual al projecte); en cas contrari fa servir el plural; com a
 * ultim recurs retorna el plural com a default.
 */
export async function resolveQuadrantCollection(
  department: string,
  options?: { prefer?: 'singular' | 'plural'; fallback?: 'plural' | 'singular' }
): Promise<string> {
  const prefer = options?.prefer ?? 'singular'
  const fallback = options?.fallback ?? 'plural'
  const cap = capitalize(norm(department))
  const plural = `quadrants${cap}`
  const singular = `quadrant${cap}`

  const ids = await listAllCollectionIds()
  const lower = new Set(ids.map((id) => id.toLowerCase()))

  if (prefer === 'singular') {
    if (lower.has(singular.toLowerCase())) return singular
    if (lower.has(plural.toLowerCase())) return plural
  } else {
    if (lower.has(plural.toLowerCase())) return plural
    if (lower.has(singular.toLowerCase())) return singular
  }

  return fallback === 'singular' ? singular : plural
}

/**
 * Helper per convertir una col·leccio `quadrants{Dept}` al departament
 * normalitzat. P. ex. `quadrantsLogistica` -> `logistica`.
 */
export function quadrantCollectionToDept(collectionId: string): string {
  const stripped = collectionId.replace(/^quadrants?/i, '')
  return norm(stripped)
}

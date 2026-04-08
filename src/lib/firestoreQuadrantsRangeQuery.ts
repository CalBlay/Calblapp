/**
 * Consultes per rang sobre col·leccions quadrants* (startDate, endDate, date, phaseDate).
 * Inclou solapament (startDate <= fi del rang AND endDate >= inici del rang) per no perdre
 * esdeveniments multi-dia quan el rang és només uns dies al mig.
 *
 * Si totes les consultes fallen (p. ex. sense índex compost), fallback a .get() complet.
 * Els índexs es creen per col·lecció (quadrantsServeis, quadrantsLogistica, …) o via enllaç d’error de Firestore.
 */
import type {
  CollectionReference,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Dues dates YYYY-MM-DD ordenades (inici <= fi). */
export function orderedDayRangeFromISOStrings(
  a: string,
  b: string
): { start: string; end: string } | null {
  const s = a.slice(0, 10)
  const e = b.slice(0, 10)
  if (!ISO_DAY.test(s) || !ISO_DAY.test(e)) return null
  return s <= e ? { start: s, end: e } : { start: e, end: s }
}

/** Dies locals (calendari) ordenats, per finestres horàries. */
export function orderedDayRangeFromLocalDates(a: Date, b: Date): { start: string; end: string } {
  const ymd = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const s = ymd(a)
  const e = ymd(b)
  return s <= e ? { start: s, end: e } : { start: e, end: s }
}

function clampISODate(raw: string): string {
  const s = raw.slice(0, 10)
  return ISO_DAY.test(s) ? s : ''
}

async function safeGet(p: Promise<QuerySnapshot>): Promise<QuerySnapshot | null> {
  try {
    return await p
  } catch {
    return null
  }
}

export type QuadrantRangeQueryResult = {
  docs: QueryDocumentSnapshot[]
  usedFullCollectionScan: boolean
}

export async function queryQuadrantCollectionDocsInDateRange(
  collectionRef: CollectionReference,
  rangeStart: string,
  rangeEnd: string
): Promise<QuadrantRangeQueryResult> {
  const s = clampISODate(rangeStart)
  const e = clampISODate(rangeEnd)
  if (!s || !e) {
    throw new Error('Rang de dates invàlid (esperat YYYY-MM-DD)')
  }

  const col = collectionRef

  const snaps = await Promise.all([
    safeGet(col.where('startDate', '<=', e).where('endDate', '>=', s).get()),
    safeGet(col.where('startDate', '>=', s).where('startDate', '<=', e).get()),
    safeGet(col.where('endDate', '>=', s).where('endDate', '<=', e).get()),
    safeGet(col.where('date', '>=', s).where('date', '<=', e).get()),
    safeGet(col.where('phaseDate', '>=', s).where('phaseDate', '<=', e).get()),
  ])

  const byId = new Map<string, QueryDocumentSnapshot>()
  let anyQueryOk = false
  for (const snap of snaps) {
    if (snap !== null) {
      anyQueryOk = true
      for (const d of snap.docs) {
        byId.set(d.id, d)
      }
    }
  }

  if (!anyQueryOk) {
    console.warn(
      '[firestoreQuadrantsRangeQuery] Cap consulta indexada ha funcionat; fallback .get() complet',
      { path: col.path }
    )
    const full = await col.get()
    for (const d of full.docs) {
      byId.set(d.id, d)
    }
    return { docs: Array.from(byId.values()), usedFullCollectionScan: true }
  }

  console.info('[firestoreQuadrantsRangeQuery]', {
    path: col.path,
    start: s,
    end: e,
    merged: byId.size,
    queriesOk: snaps.filter((x) => x !== null).length,
  })

  return { docs: Array.from(byId.values()), usedFullCollectionScan: false }
}

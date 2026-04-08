/**
 * Consultes per rang sobre stage_verd / stage_taronja (camps DataInici, DataFi com a YYYY-MM-DD o prefix).
 * Evita .get() de tota la col·lecció quan hi ha índex compost (veure firestore.indexes.json).
 *
 * Cobertura: esdeveniments que comencen dins [start,end] (Q1) o que comencen abans de `start`
 * però tenen DataFi >= start (Q2, esdeveniments multi-dia que creuen l'inici del rang).
 * Sense DataFi, el comportament del client tracta el fi com DataInici → Q2 no els retorna si
 * DataInici < start (correcte: no solapen).
 */
import type {
  Firestore,
  QueryDocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Valida prefix YYYY-MM-DD (p. ex. paràmetres d’API). */
export function isIsoDateDayParam(raw: string): boolean {
  return ISO_DAY.test(raw.slice(0, 10))
}

function clampISODate(raw: string): string {
  const s = raw.slice(0, 10)
  return ISO_DAY.test(s) ? s : ''
}

function mergeByDocId(snaps: QuerySnapshot[]): QueryDocumentSnapshot[] {
  const map = new Map<string, QueryDocumentSnapshot>()
  for (const snap of snaps) {
    for (const d of snap.docs) {
      map.set(d.id, d)
    }
  }
  return Array.from(map.values())
}

export async function queryStageCollectionDocsInDateRange(
  db: Firestore,
  collectionId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<QueryDocumentSnapshot[]> {
  const s = clampISODate(rangeStart)
  const e = clampISODate(rangeEnd)
  if (!s || !e) {
    throw new Error('Rang de dates invàlid (esperat YYYY-MM-DD)')
  }

  const col = db.collection(collectionId)

  try {
    const [snap1, snap2] = await Promise.all([
      col.where('DataInici', '>=', s).where('DataInici', '<=', e).get(),
      col.where('DataInici', '<', s).where('DataFi', '>=', s).get(),
    ])
    const merged = mergeByDocId([snap1, snap2])
    console.info('[firestoreStageRangeQuery]', {
      collection: collectionId,
      start: s,
      end: e,
      merged: merged.length,
      q1: snap1.size,
      q2: snap2.size,
    })
    return merged
  } catch (err) {
    console.warn(
      `[firestoreStageRangeQuery] Fallada consulta per rang a "${collectionId}"; fallback .get() complet`,
      err
    )
    const full = await col.get()
    return full.docs
  }
}

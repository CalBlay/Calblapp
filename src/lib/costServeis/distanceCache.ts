/**
 * Cache persistent de distàncies (Firestore) per Cost de serveis.
 * Clau: origen normalitzat → destí normalitzat.
 * Evita recalcular amb Maps/OSRM quan ja coneixem el trajecte.
 */

import { createHash } from 'crypto'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const SERVICE_COST_DISTANCE_CACHE_COL = 'serviceCostDistanceCache'

export type CachedDistance = {
  originKey: string
  destinationKey: string
  originLabel?: string
  destinationLabel?: string
  kmOneWay: number
  kmOutbound: number
  kmReturn: number
  kmTotal: number
  source?: string
  updatedAt?: string
}

/** Normalitza text per a la clau de cache (estable). */
export function normalizeDistanceCacheKey(raw?: string | null): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[|/]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function distanceCacheDocId(originKey: string, destinationKey: string): string {
  const payload = `${originKey}→${destinationKey}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 40)
}

export async function getCachedDistance(
  originRaw: string,
  destinationRaw: string
): Promise<CachedDistance | null> {
  const originKey = normalizeDistanceCacheKey(originRaw)
  const destinationKey = normalizeDistanceCacheKey(destinationRaw)
  if (!originKey || !destinationKey) return null

  try {
    const id = distanceCacheDocId(originKey, destinationKey)
    const snap = await db.collection(SERVICE_COST_DISTANCE_CACHE_COL).doc(id).get()
    if (!snap.exists) return null
    const data = snap.data() as CachedDistance
    if (!data || (!(Number(data.kmTotal) > 0) && !(Number(data.kmOneWay) > 0))) return null
    return {
      originKey,
      destinationKey,
      originLabel: data.originLabel,
      destinationLabel: data.destinationLabel,
      kmOneWay: Number(data.kmOneWay) || Number(data.kmOutbound) || 0,
      kmOutbound: Number(data.kmOutbound) || Number(data.kmOneWay) || 0,
      kmReturn: Number(data.kmReturn) || 0,
      kmTotal: Number(data.kmTotal) || 0,
      source: data.source,
      updatedAt: data.updatedAt,
    }
  } catch (error) {
    console.warn('[distanceCache] get error', error)
    return null
  }
}

/** Lectura en lot (p. ex. llista del mes). */
export async function getCachedDistances(
  pairs: Array<{ origin: string; destination: string }>
): Promise<Map<string, CachedDistance>> {
  const out = new Map<string, CachedDistance>()
  const unique = new Map<string, { originKey: string; destinationKey: string; mapKey: string }>()

  for (const pair of pairs) {
    const originKey = normalizeDistanceCacheKey(pair.origin)
    const destinationKey = normalizeDistanceCacheKey(pair.destination)
    if (!originKey || !destinationKey) continue
    const id = distanceCacheDocId(originKey, destinationKey)
    const mapKey = `${originKey}→${destinationKey}`
    unique.set(id, { originKey, destinationKey, mapKey })
  }

  const ids = [...unique.keys()]
  const chunkSize = 30
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map(async (id) => {
        const meta = unique.get(id)!
        try {
          const snap = await db.collection(SERVICE_COST_DISTANCE_CACHE_COL).doc(id).get()
          if (!snap.exists) return
          const data = snap.data() as CachedDistance
          const kmOneWay = Number(data.kmOneWay) || Number(data.kmOutbound) || 0
          const kmTotal = Number(data.kmTotal) || 0
          if (kmTotal <= 0 && kmOneWay <= 0) return
          out.set(meta.mapKey, {
            originKey: meta.originKey,
            destinationKey: meta.destinationKey,
            originLabel: data.originLabel,
            destinationLabel: data.destinationLabel,
            kmOneWay,
            kmOutbound: Number(data.kmOutbound) || kmOneWay,
            kmReturn: Number(data.kmReturn) || 0,
            kmTotal: kmTotal || Math.round(kmOneWay * 2 * 10) / 10,
            source: data.source,
            updatedAt: data.updatedAt,
          })
        } catch (error) {
          console.warn('[distanceCache] batch get error', id, error)
        }
      })
    )
  }

  return out
}

export async function setCachedDistance(input: {
  origin: string
  destination: string
  originLabel?: string
  destinationLabel?: string
  kmOneWay: number
  kmOutbound: number
  kmReturn: number
  kmTotal: number
  source?: string
}): Promise<void> {
  const originKey = normalizeDistanceCacheKey(input.origin)
  const destinationKey = normalizeDistanceCacheKey(input.destination)
  if (!originKey || !destinationKey) return
  if (!(Number(input.kmTotal) > 0) && !(Number(input.kmOneWay) > 0)) return

  try {
    const id = distanceCacheDocId(originKey, destinationKey)
    const payload: CachedDistance = {
      originKey,
      destinationKey,
      originLabel: input.originLabel || input.origin,
      destinationLabel: input.destinationLabel || input.destination,
      kmOneWay: Number(input.kmOneWay) || Number(input.kmOutbound) || 0,
      kmOutbound: Number(input.kmOutbound) || Number(input.kmOneWay) || 0,
      kmReturn: Number(input.kmReturn) || 0,
      kmTotal:
        Number(input.kmTotal) ||
        Math.round(
          ((Number(input.kmOutbound) || Number(input.kmOneWay) || 0) +
            (Number(input.kmReturn) || 0)) *
            10
        ) / 10,
      source: input.source || 'osrm',
      updatedAt: new Date().toISOString(),
    }
    await db.collection(SERVICE_COST_DISTANCE_CACHE_COL).doc(id).set(payload, { merge: true })
  } catch (error) {
    console.warn('[distanceCache] set error', error)
  }
}

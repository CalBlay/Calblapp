/**
 * Distància en cotxe via Photon (geocode) + OSRM (ruta) + Haversine fallback.
 * Circuit breaker: si Photon no és accessible, no insistir (evita timeouts de 10s).
 */

export type OsrmMapsPlace =
  | string
  | {
      address?: string | null
      label?: string | null
      lat?: number | null
      lng?: number | null
    }

export type OsrmDrivingDistanceResult = {
  kmOneWay: number
  meters: number
  durationSeconds: number | null
  originUsed: string
  destinationUsed: string
}

type LatLng = { lat: number; lng: number }

const GEOCODE_TIMEOUT_MS = 2000
const ROUTE_TIMEOUT_MS = 2500

const geocodeCache = new Map<string, LatLng>()
const routeCache = new Map<string, OsrmDrivingDistanceResult>()

/** Si Photon/OSRM fallen per xarxa, desem de cridar durant un temps curt. */
let externalGeoDisabledUntil = 0
let externalGeoFailCount = 0
const EXTERNAL_GEO_COOLDOWN_MS = 2 * 60 * 1000

export function isExternalGeoDisabled(): boolean {
  return Date.now() < externalGeoDisabledUntil
}

function tripExternalGeoCircuit(error?: unknown) {
  externalGeoFailCount += 1
  const isNet =
    !error ||
    String((error as { cause?: { code?: string } })?.cause?.code || '').includes('TIMEOUT') ||
    String((error as { message?: string })?.message || '')
      .toLowerCase()
      .includes('fetch failed')
  // Només desactivar després de diversos errors seguits (no al primer)
  if (isNet && externalGeoFailCount >= 4) {
    externalGeoDisabledUntil = Date.now() + EXTERNAL_GEO_COOLDOWN_MS
    console.warn(
      '[osrmDistance] geocode extern en pausa 2 min (timeouts). Continuarem amb cache/Google.'
    )
  }
}

/** Cua global: 1 geocode a la vegada. */
let geocodeTail: Promise<unknown> = Promise.resolve()
function enqueueGeocode<T>(fn: () => Promise<T>): Promise<T> {
  const run = geocodeTail.then(fn, fn)
  geocodeTail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function withTimeout(ms: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  if (parent) {
    if (parent.aborted) ctrl.abort()
    else parent.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return {
    signal: ctrl.signal,
    clear: () => clearTimeout(t),
  }
}

function placeToMapsQuery(place: OsrmMapsPlace): string {
  if (typeof place === 'string') return place.trim()
  const lat = place.lat
  const lng = place.lng
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return `${lat},${lng}`
  }
  return String(place.address || place.label || '').trim()
}

function metersToKm(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0
  return Math.round((meters / 1000) * 10) / 10
}

function cacheKey(a: string, b: string): string {
  return `${a.trim().toLowerCase()}→${b.trim().toLowerCase()}`
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function geocodeQueryVariants(query: string): string[] {
  const base = query.trim()
  if (!base) return []
  const stripped = base
    .replace(/,\s*(Catalunya|Catalonia|Spain|Espanya|España).*$/i, '')
    .trim()
  return [stripped || base]
}

async function geocodePhotonOnce(q: string, signal?: AbortSignal): Promise<LatLng | null> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '1')

  const timed = withTimeout(GEOCODE_TIMEOUT_MS, signal)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: timed.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: number[] } }>
    }
    const coords = json.features?.[0]?.geometry?.coordinates
    const lng = Number(coords?.[0])
    const lat = Number(coords?.[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } finally {
    timed.clear()
  }
}

/** Geocoding Photon (cua + circuit breaker). */
export async function geocodeAddress(
  query: string,
  options?: { signal?: AbortSignal }
): Promise<LatLng | null> {
  const q = String(query || '').trim()
  if (!q) return null

  const key = q.toLowerCase()
  const cached = geocodeCache.get(key)
  if (cached) return cached

  const coord = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (coord) {
    const lat = Number(coord[1])
    const lng = Number(coord[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const out = { lat, lng }
      geocodeCache.set(key, out)
      return out
    }
  }

  if (isExternalGeoDisabled()) return null

  return enqueueGeocode(async () => {
    if (isExternalGeoDisabled()) return null
    const again = geocodeCache.get(key)
    if (again) return again

    for (const variant of geocodeQueryVariants(q)) {
      try {
        const hit = await geocodePhotonOnce(variant, options?.signal)
        if (hit) {
          externalGeoFailCount = 0
          geocodeCache.set(key, hit)
          return hit
        }
      } catch (error) {
        tripExternalGeoCircuit(error)
        return null
      }
    }
    // Sense resultat però sense error de xarxa: no obrir circuit encara
    return null
  })
}

function placeToLatLngHint(place: OsrmMapsPlace): LatLng | null {
  if (typeof place === 'string') return null
  const lat = place.lat
  const lng = place.lng
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng }
  }
  return null
}

/** Distància en cotxe (anada) via OSRM; Haversine×1.3 si la ruta falla. */
export async function fetchOsrmDrivingDistanceKm(
  origin: OsrmMapsPlace,
  destination: OsrmMapsPlace,
  options?: { signal?: AbortSignal; bypassCache?: boolean }
): Promise<OsrmDrivingDistanceResult | null> {
  const originUsed = placeToMapsQuery(origin)
  const destinationUsed = placeToMapsQuery(destination)
  if (!originUsed || !destinationUsed) return null

  const key = cacheKey(originUsed, destinationUsed)
  if (!options?.bypassCache) {
    const cached = routeCache.get(key)
    if (cached) return cached
  }

  const originCoords = placeToLatLngHint(origin) || (await geocodeAddress(originUsed, options))
  const destCoords =
    placeToLatLngHint(destination) || (await geocodeAddress(destinationUsed, options))

  if (!originCoords || !destCoords) return null

  if (!isExternalGeoDisabled()) {
    const url = new URL(
      `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`
    )
    url.searchParams.set('overview', 'false')
    url.searchParams.set('alternatives', 'false')

    const timed = withTimeout(ROUTE_TIMEOUT_MS, options?.signal)
    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: timed.signal,
        cache: 'no-store',
      })
      if (res.ok) {
        const json = (await res.json()) as {
          code?: string
          routes?: Array<{ distance?: number; duration?: number }>
        }
        if (json.code === 'Ok') {
          const meters = Number(json.routes?.[0]?.distance) || 0
          if (meters > 0) {
            externalGeoFailCount = 0
            const result: OsrmDrivingDistanceResult = {
              kmOneWay: metersToKm(meters),
              meters,
              durationSeconds:
                json.routes?.[0]?.duration != null
                  ? Math.round(Number(json.routes[0].duration))
                  : null,
              originUsed,
              destinationUsed,
            }
            routeCache.set(key, result)
            return result
          }
        }
      }
    } catch (error) {
      tripExternalGeoCircuit(error)
    } finally {
      timed.clear()
    }
  }

  // Amb coords (origen amb lat/lng + destí geocodat o amb hint) → Haversine
  const approx = haversineMeters(originCoords, destCoords) * 1.3
  if (approx > 0) {
    const result: OsrmDrivingDistanceResult = {
      kmOneWay: metersToKm(approx),
      meters: Math.round(approx),
      durationSeconds: null,
      originUsed,
      destinationUsed,
    }
    routeCache.set(key, result)
    return result
  }

  return null
}

export function clearOsrmDistanceCache() {
  geocodeCache.clear()
  routeCache.clear()
  externalGeoFailCount = 0
  externalGeoDisabledUntil = 0
}

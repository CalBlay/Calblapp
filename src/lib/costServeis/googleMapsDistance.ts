/**
 * Distància en cotxe per Cost de serveis.
 *
 * Flux:
 * 1) (la capa applyDepartureKm) mira Firestore
 * 2) Aquí: Google Directions → Geocoding+Haversine → (opcional OSRM)
 * 3) applyDepartureKm desa a Firestore
 *
 * Photon està bloquejat a moltes xarxes corporatives → desactivat per defecte.
 */

export type MapsPlace =
  | string
  | {
      address?: string | null
      label?: string | null
      lat?: number | null
      lng?: number | null
    }

export type DrivingDistanceResult = {
  kmOneWay: number
  meters: number
  durationSeconds: number | null
  originUsed: string
  destinationUsed: string
  source?: 'google-directions' | 'google-haversine' | 'osrm'
}

export type RoundTripKmResult = DrivingDistanceResult & {
  kmOutbound: number
  kmReturn: number
  kmTotal: number
}

type LatLng = { lat: number; lng: number }

const memoryCache = new Map<string, DrivingDistanceResult>()
const geocodeCache = new Map<string, LatLng>()
let googleWarned = false

export function resolveGoogleMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
    ''
  ).trim()
}

export function placeToMapsQuery(place: MapsPlace): string {
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

function cacheKey(origin: string, destination: string): string {
  return `${origin.trim().toLowerCase()}→${destination.trim().toLowerCase()}`
}

function metersToKm(meters: number): number {
  if (!Number.isFinite(meters) || meters <= 0) return 0
  return Math.round((meters / 1000) * 10) / 10
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

function placeLatLng(place: MapsPlace): LatLng | null {
  if (typeof place === 'string') {
    const m = place.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!m) return null
    const lat = Number(m[1])
    const lng = Number(m[2])
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  }
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

function resolveTexts(origin: MapsPlace, destination: MapsPlace) {
  const originUsed =
    typeof origin === 'string'
      ? origin.trim()
      : String(origin.address || origin.label || placeToMapsQuery(origin)).trim()
  const destinationUsed =
    typeof destination === 'string'
      ? destination.trim()
      : String(
          destination.address || destination.label || placeToMapsQuery(destination)
        ).trim()
  return { originUsed, destinationUsed }
}

function withTimeoutMs(ms: number, parent?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  if (parent) {
    if (parent.aborted) ctrl.abort()
    else parent.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return { signal: ctrl.signal, clear: () => clearTimeout(t) }
}

/** Geocode amb Google Geocoding API (adreça → lat/lng). */
export async function geocodeWithGoogle(
  address: string,
  options?: { signal?: AbortSignal }
): Promise<LatLng | null> {
  const q = String(address || '').trim()
  if (!q) return null

  const key = q.toLowerCase()
  const cached = geocodeCache.get(key)
  if (cached) return cached

  const asCoord = placeLatLng(q)
  if (asCoord) {
    geocodeCache.set(key, asCoord)
    return asCoord
  }

  const apiKey = resolveGoogleMapsApiKey()
  if (!apiKey) return null

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', q)
  url.searchParams.set('language', 'ca')
  url.searchParams.set('region', 'es')
  url.searchParams.set('key', apiKey)

  const timed = withTimeoutMs(6000, options?.signal)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: timed.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      status?: string
      error_message?: string
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>
    }
    if (json.status && json.status !== 'OK') {
      if (!googleWarned) {
        googleWarned = true
        console.warn('[googleMapsDistance] Geocoding', json.status, json.error_message || '')
      }
      return null
    }
    const loc = json.results?.[0]?.geometry?.location
    const lat = Number(loc?.lat)
    const lng = Number(loc?.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    const out = { lat, lng }
    geocodeCache.set(key, out)
    return out
  } catch (error) {
    if (!googleWarned) {
      googleWarned = true
      console.warn('[googleMapsDistance] Geocoding fetch error', error)
    }
    return null
  } finally {
    timed.clear()
  }
}

async function fetchGoogleDirectionsDistanceKm(
  originUsed: string,
  destinationUsed: string,
  options?: { signal?: AbortSignal }
): Promise<DrivingDistanceResult | null> {
  const apiKey = resolveGoogleMapsApiKey()
  if (!apiKey) return null

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', originUsed)
  url.searchParams.set('destination', destinationUsed)
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('units', 'metric')
  url.searchParams.set('language', 'ca')
  url.searchParams.set('region', 'es')
  url.searchParams.set('key', apiKey)

  const timed = withTimeoutMs(8000, options?.signal)
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      signal: timed.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      status?: string
      error_message?: string
      routes?: Array<{
        legs?: Array<{
          distance?: { value?: number }
          duration?: { value?: number }
        }>
      }>
    }
    if (json.status && json.status !== 'OK') {
      if (!googleWarned) {
        googleWarned = true
        console.warn(
          '[googleMapsDistance] Directions',
          json.status,
          json.error_message || ''
        )
      }
      return null
    }
    const leg = json.routes?.[0]?.legs?.[0]
    const meters = Number(leg?.distance?.value) || 0
    if (meters <= 0) return null
    return {
      kmOneWay: metersToKm(meters),
      meters,
      durationSeconds: leg?.duration?.value != null ? Number(leg.duration.value) || null : null,
      originUsed,
      destinationUsed,
      source: 'google-directions',
    }
  } catch {
    return null
  } finally {
    timed.clear()
  }
}

/**
 * Distància en cotxe (anada).
 * Directions → Geocode+Haversine×1.3 (fiable sense Photon).
 */
export async function fetchDrivingDistanceKm(
  origin: MapsPlace,
  destination: MapsPlace,
  options?: { signal?: AbortSignal; bypassCache?: boolean }
): Promise<DrivingDistanceResult | null> {
  const { originUsed, destinationUsed } = resolveTexts(origin, destination)
  if (!originUsed || !destinationUsed) return null

  const key = cacheKey(originUsed, destinationUsed)
  if (!options?.bypassCache) {
    const cached = memoryCache.get(key)
    if (cached) return cached
  }

  // 1) Google Directions (ruta real en cotxe)
  const fromDirections = await fetchGoogleDirectionsDistanceKm(
    // Preferir adreça textual per al geocoder de Directions
    typeof origin === 'string'
      ? origin
      : String(origin.address || origin.label || originUsed),
    destinationUsed,
    options
  )
  if (fromDirections && fromDirections.kmOneWay > 0) {
    memoryCache.set(key, fromDirections)
    return fromDirections
  }

  // 2) Geocode Google + Haversine×1.3 (origen ja pot tenir lat/lng)
  const originCoords =
    placeLatLng(origin) || (await geocodeWithGoogle(originUsed, options))

  // Destí: provar text net i amb context Catalunya si cal
  let destCoords = placeLatLng(destination)
  if (!destCoords) {
    destCoords = await geocodeWithGoogle(destinationUsed, options)
  }
  if (!destCoords && !/barcelona|catalun|spain|espa/i.test(destinationUsed)) {
    destCoords = await geocodeWithGoogle(`${destinationUsed}, Catalunya, Spain`, options)
  }

  if (originCoords && destCoords) {
    const approx = haversineMeters(originCoords, destCoords) * 1.3
    if (approx > 0) {
      const result: DrivingDistanceResult = {
        kmOneWay: metersToKm(approx),
        meters: Math.round(approx),
        durationSeconds: null,
        originUsed,
        destinationUsed,
        source: 'google-haversine',
      }
      memoryCache.set(key, result)
      return result
    }
  }

  // 3) OSRM només si s’activa explícitament (Photon sol fallar a la xarxa)
  if (String(process.env.COST_SERVEIS_ENABLE_OSRM || '').trim() === '1') {
    try {
      const { fetchOsrmDrivingDistanceKm } = await import('@/lib/costServeis/osrmDistance')
      const fromOsrm = await fetchOsrmDrivingDistanceKm(origin, destination, options)
      if (fromOsrm && fromOsrm.kmOneWay > 0) {
        const result: DrivingDistanceResult = { ...fromOsrm, source: 'osrm' }
        memoryCache.set(key, result)
        return result
      }
    } catch {
      // ignore
    }
  }

  return null
}

/** Km anada / tornada / total. */
export async function fetchRoundTripKm(
  origin: MapsPlace,
  destination: MapsPlace,
  options?: { roundTrip?: boolean; signal?: AbortSignal; bypassCache?: boolean }
): Promise<RoundTripKmResult | null> {
  const oneWay = await fetchDrivingDistanceKm(origin, destination, options)
  if (!oneWay) return null

  const roundTrip = options?.roundTrip !== false
  const kmOutbound = oneWay.kmOneWay
  const kmReturn = roundTrip ? oneWay.kmOneWay : 0
  const kmTotal = Math.round((kmOutbound + kmReturn) * 10) / 10

  return {
    ...oneWay,
    kmOutbound,
    kmReturn,
    kmTotal,
  }
}

export function clearGoogleMapsDistanceCache() {
  memoryCache.clear()
  geocodeCache.clear()
}

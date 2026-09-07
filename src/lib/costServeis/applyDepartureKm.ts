/**
 * Aplica km als blocs de cost.
 *
 * Flux (1 cop per trajecte):
 * 1) Busca a Firestore `serviceCostDistanceCache`
 * 2) Si no hi és → Google Routes API
 * 3) Desa el resultat a Firestore
 * 4) El proper reload ja el troba a la taula
 */
import { newVehicleTripLine } from '@/lib/costServeis/defaults'
import {
  getCachedDistance,
  setCachedDistance,
  normalizeDistanceCacheKey,
} from '@/lib/costServeis/distanceCache'
import { fetchRoundTripKm, placeToMapsQuery } from '@/lib/costServeis/googleMapsDistance'
import type {
  CostServeisDepartment,
  DepartureByDept,
  DepartmentCostBlock,
  FuelConfig,
  ServiceCostSheet,
} from '@/lib/costServeis/types'
import { COST_SERVEIS_DEPARTMENTS } from '@/lib/costServeis/types'

/** Neteja text d’ubicació per al geocoding. */
export function normalizeEventLocationForMaps(raw?: string | null): string {
  return String(raw || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s*[|/]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type DeptTripKm = {
  kmOutbound: number
  kmReturn: number
  kmTotal: number
}

async function resolveRoundTripKm(opts: {
  origin: {
    address?: string | null
    label?: string | null
    lat?: number | null
    lng?: number | null
  }
  destination: string
  roundTrip: boolean
  /** Només taula Firestore (sense cridar Google). */
  cacheOnly?: boolean
}): Promise<DeptTripKm | null> {
  const originLabel = String(opts.origin.address || opts.origin.label || '').trim()
  const originQuery = placeToMapsQuery(opts.origin) || originLabel
  const originCacheKey = originLabel || originQuery
  const destination = opts.destination

  // 1) Taula Firestore
  const cached = await getCachedDistance(originCacheKey, destination)
  if (cached) {
    const kmOutbound = cached.kmOutbound || cached.kmOneWay
    const kmReturn =
      opts.roundTrip && cached.kmReturn <= 0 ? kmOutbound : cached.kmReturn
    const kmTotal =
      cached.kmTotal > 0
        ? cached.kmTotal
        : Math.round((kmOutbound + kmReturn) * 10) / 10
    if (kmTotal > 0) {
      return { kmOutbound, kmReturn, kmTotal }
    }
  }

  if (opts.cacheOnly) return null

  // 2) Google Routes (només si no hi era a la taula)
  const result = await fetchRoundTripKm(
    {
      address: opts.origin.address || originLabel,
      label: opts.origin.label,
      lat: opts.origin.lat,
      lng: opts.origin.lng,
    },
    destination,
    { roundTrip: opts.roundTrip }
  )
  if (!result || result.kmTotal <= 0) return null

  // 3) Desa a Firestore → el proper reload ja el trobarà
  await setCachedDistance({
    origin: originCacheKey,
    destination,
    originLabel,
    destinationLabel: destination,
    kmOneWay: result.kmOneWay,
    kmOutbound: result.kmOutbound,
    kmReturn: result.kmReturn,
    kmTotal: result.kmTotal,
    source: result.source || 'google-routes',
  })

  return {
    kmOutbound: result.kmOutbound,
    kmReturn: result.kmReturn,
    kmTotal: result.kmTotal,
  }
}

/**
 * Calcula km per departament.
 * Per defecte: cache → Google → desar.
 * `cacheOnly: true`: només llegeix la taula.
 */
export async function computeKmByDepartment(opts: {
  departures: DepartureByDept
  destination: string
  destinationHint?: string
  roundTripDefault?: boolean
  cacheOnly?: boolean
}): Promise<Partial<Record<CostServeisDepartment, DeptTripKm>>> {
  let destination = normalizeEventLocationForMaps(opts.destination)
  if (!destination) {
    destination = normalizeEventLocationForMaps(opts.destinationHint)
  }
  if (!destination) return {}

  const roundTrip = opts.roundTripDefault !== false
  const out: Partial<Record<CostServeisDepartment, DeptTripKm>> = {}

  const byOrigin = new Map<string, CostServeisDepartment[]>()
  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    const dep = opts.departures[dept]
    const origin = String(dep?.address || dep?.label || '').trim()
    if (!origin) continue
    const key = normalizeDistanceCacheKey(origin)
    if (!byOrigin.has(key)) byOrigin.set(key, [])
    byOrigin.get(key)!.push(dept)
  }

  // Sequencial per origen: menys càrrega a Google i millor per desar cache
  for (const [, depts] of byOrigin.entries()) {
    const dept0 = depts[0]
    const dep = opts.departures[dept0]
    const trip = await resolveRoundTripKm({
      origin: {
        address: dep.address,
        label: dep.label,
        lat: dep.lat,
        lng: dep.lng,
      },
      destination,
      roundTrip,
      cacheOnly: opts.cacheOnly,
    })
    if (!trip) continue
    for (const dept of depts) {
      out[dept] = trip
    }
  }

  return out
}

function tripHasKm(block: DepartmentCostBlock): boolean {
  return (block.vehicleTrips || []).some(
    (t) =>
      (Number(t.kmOutbound) || 0) > 0 ||
      (Number(t.kmReturn) || 0) > 0 ||
      (Number(t.kmTotal) || 0) > 0
  )
}

export function applyKmToSheetDepartments(
  sheet: ServiceCostSheet,
  kmByDept: Partial<Record<CostServeisDepartment, DeptTripKm>>,
  opts?: {
    vehicleCountByDept?: Partial<Record<CostServeisDepartment, number>>
    vehicleTypesByDept?: Partial<Record<CostServeisDepartment, string[]>>
    fuel?: FuelConfig
  }
): ServiceCostSheet {
  const departments = { ...sheet.departments }

  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    const prev = departments[dept]
    if (!prev) continue

    const fromQuadrant = Math.max(0, Number(opts?.vehicleCountByDept?.[dept]) || 0)
    const types = opts?.vehicleTypesByDept?.[dept] || []
    const typeAt = (i: number) => types[i] || types[0] || 'camioGran'
    let trips = [...(prev.vehicleTrips || [])]

    if (trips.length === 0 && fromQuadrant > 0) {
      trips = Array.from({ length: fromQuadrant }, (_, i) =>
        newVehicleTripLine({ vehicleType: typeAt(i) })
      )
    }

    const km = kmByDept[dept]
    if (km && km.kmTotal > 0 && !tripHasKm({ ...prev, vehicleTrips: trips })) {
      // Sense vehicles al quadrant → no inventem 1 trajecte
      const vehicleCount = Math.max(trips.length, fromQuadrant)
      if (vehicleCount <= 0) {
        departments[dept] = { ...prev, vehicleTrips: trips }
        continue
      }
      while (trips.length < vehicleCount) {
        trips.push(newVehicleTripLine({ vehicleType: typeAt(trips.length) }))
      }
      trips = trips.map((t, i) =>
        newVehicleTripLine({
          ...t,
          vehicleType: t.vehicleType || typeAt(i),
          kmOutbound: km.kmOutbound,
          kmReturn: km.kmReturn,
          kmTotal: km.kmTotal,
        })
      )
    }

    departments[dept] = { ...prev, vehicleTrips: trips }
  }

  return { ...sheet, departments }
}

/** Desa km manuals/calculats de la fitxa a la taula Firestore. */
export async function persistSheetDistancesToCache(opts: {
  departures: DepartureByDept
  destination: string
  destinationHint?: string
  departments: ServiceCostSheet['departments']
}): Promise<number> {
  let destination = normalizeEventLocationForMaps(opts.destination)
  if (!destination) {
    destination = normalizeEventLocationForMaps(opts.destinationHint)
  }
  if (!destination) return 0

  let saved = 0
  const seenOrigins = new Set<string>()

  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    const dep = opts.departures[dept]
    const originLabel = String(dep?.address || dep?.label || '').trim()
    if (!originLabel) continue
    const originKey = normalizeDistanceCacheKey(originLabel)
    if (seenOrigins.has(originKey)) continue

    const trips = opts.departments?.[dept]?.vehicleTrips || []
    const withKm = trips.find(
      (t) =>
        (Number(t.kmTotal) || 0) > 0 ||
        (Number(t.kmOutbound) || 0) > 0 ||
        (Number(t.kmReturn) || 0) > 0
    )
    if (!withKm) continue

    seenOrigins.add(originKey)
    const kmOutbound = Number(withKm.kmOutbound) || Number(withKm.kmTotal) / 2 || 0
    const kmReturn = Number(withKm.kmReturn) || kmOutbound
    const kmTotal =
      Number(withKm.kmTotal) || Math.round((kmOutbound + kmReturn) * 10) / 10
    if (kmTotal <= 0) continue

    await setCachedDistance({
      origin: originLabel,
      destination,
      originLabel,
      destinationLabel: destination,
      kmOneWay: kmOutbound,
      kmOutbound,
      kmReturn,
      kmTotal,
      source: 'sheet',
    })
    saved += 1
  }

  return saved
}

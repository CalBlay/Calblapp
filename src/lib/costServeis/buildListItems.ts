/**
 * Construeix la llista d’events amb cost operatiu auto
 * (personal + combustible + estructura Opsia). Compartit per Edició i Resultats.
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'
import { emptyDeptSummary, summarizeDepartmentBlock } from '@/lib/costServeis/calc'
import { emptyDepartmentBlock, newVehicleTripLine } from '@/lib/costServeis/defaults'
import {
  computeKmByDepartment,
  normalizeEventLocationForMaps,
  type DeptTripKm,
} from '@/lib/costServeis/applyDepartureKm'
import {
  getCachedDistances,
  normalizeDistanceCacheKey,
} from '@/lib/costServeis/distanceCache'
import {
  normalizeClockTime,
  staffingByCostDeptInDateRange,
} from '@/lib/costServeis/quadrantPeople'
import { getServiceCostConfig, listServiceCostSheetsByDateRange } from '@/lib/costServeis/store'
import {
  COST_SERVEIS_DEPARTMENTS,
  type CostServeisDepartment,
  type ServiceCostDeptSummary,
  type ServiceCostListItem,
} from '@/lib/costServeis/types'
import { listServeis, matchServeiCatalogId } from '@/lib/serveis/server'
import {
  allServiceTypesInCatalog,
  splitServiceTypeLabels,
} from '@/lib/serveis/utils'
import {
  applyManualDeductionsToPots,
  listManualServicesByDateRange,
  sumManualPotDeductions,
  type ManualServiceLine,
} from '@/lib/costServeis/manualServices'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import { getOpsiaMonthDoc } from '@/lib/costServeis/opsiaFinance'
import { listServeiWeightRows, PONDERACIO_DEPTS } from '@/lib/costServeis/serveiWeights'
import {
  allocateStructurePotsToEvents,
  resolveStructurePots,
} from '@/lib/costServeis/allocateStructure'

function readServiceType(d: Record<string, unknown>): string {
  return String(
    d.Servei || d.Servicio || d.service || d.TipusServei || d.tipusServei || d.serviceType || ''
  ).trim()
}

function dayKey(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  if (
    v &&
    typeof v === 'object' &&
    'toDate' in v &&
    typeof (v as { toDate: () => Date }).toDate === 'function'
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  try {
    return new Date(String(v)).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function emptyByDept(): Record<CostServeisDepartment, number> {
  return { logistica: 0, serveis: 0, cuina: 0 }
}

function emptyDetailByDept(): Record<CostServeisDepartment, ServiceCostDeptSummary> {
  return {
    logistica: emptyDeptSummary(),
    serveis: emptyDeptSummary(),
    cuina: emptyDeptSummary(),
  }
}

export type BuildCostServeisListResult = {
  items: ServiceCostListItem[]
  manuals: ManualServiceLine[]
  missingServiceTypes: Array<{ nom: string; count: number }>
  maps: {
    locations: number
    resolved: number
    computedThisRequest: number
    hasApiKey: boolean
  }
}

export async function buildCostServeisListItems(
  from: string,
  to: string
): Promise<BuildCostServeisListResult> {
  if (!isIsoDateDayParam(from) || !isIsoDateDayParam(to)) {
    throw new Error('Paràmetres from/to obligatoris (YYYY-MM-DD)')
  }

  const [stageDocs, sheets, config, serveisCatalog, spaceIndex, manuals] =
    await Promise.all([
      queryStageCollectionDocsInDateRange(db, 'stage_verd', from, to),
      listServiceCostSheetsByDateRange(from, to),
      getServiceCostConfig(),
      listServeis(),
      loadSpaceOwnershipIndex(),
      listManualServicesByDateRange(from, to),
    ])
  const manualDeductionsByYm = sumManualPotDeductions(manuals)

  const sheetById = new Map(sheets.map((s) => [s.eventId, s]))
  const catalogIndex = serveisCatalog.map((s) => ({
    id: s.id,
    nom: s.nom,
    codi: s.codi,
  }))
  const eventIds = stageDocs.map((doc) => doc.id)
  const eventEndById = new Map<string, string>()
  const eventStartById = new Map<string, string>()
  for (const doc of stageDocs) {
    const d = doc.data() as Record<string, unknown>
    eventEndById.set(
      doc.id,
      normalizeClockTime(String(d.HoraFi ?? d.horaFi ?? d.endTime ?? ''))
    )
    eventStartById.set(
      doc.id,
      normalizeClockTime(
        String(d.HoraInici ?? d.horaInici ?? d.Hora ?? d.hora ?? d.startTime ?? '')
      )
    )
  }

  const staffingByEvent = await staffingByCostDeptInDateRange(
    from,
    to,
    eventIds,
    eventEndById,
    eventStartById
  )

  const locationMeta = stageDocs.map((doc) => {
    const d = doc.data() as Record<string, unknown>
    const location = String(d.Ubicacio || '')
    const eventName = String(d.NomEvent || d.summary || '')
    const key =
      normalizeEventLocationForMaps(location) ||
      normalizeEventLocationForMaps(eventName)
    return { location, eventName, key }
  })
  const uniqueKeys = [...new Set(locationMeta.map((m) => m.key).filter(Boolean))]

  const originByDept = COST_SERVEIS_DEPARTMENTS.map((dept) => ({
    dept,
    origin: String(
      config.departures[dept]?.address || config.departures[dept]?.label || ''
    ).trim(),
  })).filter((row) => row.origin)

  const uniqueOrigins = [...new Set(originByDept.map((o) => o.origin))]
  const cachePairs: Array<{ origin: string; destination: string }> = []
  for (const key of uniqueKeys) {
    const sample = locationMeta.find((m) => m.key === key)
    const destination =
      normalizeEventLocationForMaps(sample?.location) ||
      normalizeEventLocationForMaps(sample?.eventName) ||
      key
    for (const origin of uniqueOrigins) {
      cachePairs.push({ origin, destination })
    }
  }

  const cachedDistances = await getCachedDistances(cachePairs)
  const roundTrip = config.fuel.roundTripDefault !== false
  const kmByLocation = new Map<string, Partial<Record<CostServeisDepartment, DeptTripKm>>>()
  let mapsResolved = 0
  let mapsComputed = 0

  for (const key of uniqueKeys) {
    const sample = locationMeta.find((m) => m.key === key)
    const destination =
      normalizeEventLocationForMaps(sample?.location) ||
      normalizeEventLocationForMaps(sample?.eventName) ||
      key
    const destKey = normalizeDistanceCacheKey(destination)
    let km: Partial<Record<CostServeisDepartment, DeptTripKm>> = {}

    for (const { dept, origin } of originByDept) {
      const mapKey = `${normalizeDistanceCacheKey(origin)}→${destKey}`
      const hit = cachedDistances.get(mapKey)
      if (!hit) continue
      const kmOutbound = hit.kmOutbound || hit.kmOneWay
      const kmReturn = roundTrip && hit.kmReturn <= 0 ? kmOutbound : hit.kmReturn
      const kmTotal =
        hit.kmTotal > 0
          ? hit.kmTotal
          : Math.round((kmOutbound + kmReturn) * 10) / 10
      if (kmTotal > 0) {
        km[dept] = { kmOutbound, kmReturn, kmTotal }
      }
    }

    if (Object.keys(km).length === 0) {
      km = await computeKmByDepartment({
        departures: config.departures,
        destination: sample?.location || destination,
        destinationHint: sample?.eventName,
        roundTripDefault: roundTrip,
      })
      if (Object.keys(km).length > 0) mapsComputed += 1
    }

    if (Object.keys(km).length > 0) mapsResolved += 1
    kmByLocation.set(key.toLowerCase(), km)
  }

  const items: ServiceCostListItem[] = stageDocs
    .map((doc) => {
      const d = doc.data() as Record<string, unknown>
      const eventDate = dayKey(d.DataInici)
      if (!eventDate || eventDate < from || eventDate > to) return null
      const sheet = sheetById.get(doc.id)
      const billing = Number(d.Import ?? d.importAmount ?? 0) || 0
      const byDepartment = emptyByDept()
      const detailByDepartment = emptyDetailByDept()
      const staffing = staffingByEvent.get(doc.id)
      const location = String(d.Ubicacio || '')
      const eventName = String(d.NomEvent || d.summary || 'Sense nom')
      const locKey = (
        normalizeEventLocationForMaps(location) ||
        normalizeEventLocationForMaps(eventName)
      ).toLowerCase()
      const kmByDept = locKey ? kmByLocation.get(locKey) || {} : {}

      for (const dept of COST_SERVEIS_DEPARTMENTS) {
        const s = staffing?.[dept]
        let block = {
          ...(sheet?.departments?.[dept] || emptyDepartmentBlock()),
          peopleCount: s?.peopleCount ?? 0,
          callTime: s?.callTime || '',
          closeTime: s?.closeTime || '',
          hours: s?.hours ?? 0,
          hoursManual: false,
        }

        const fromQuadrant = Math.max(0, Number(s?.vehicleCount) || 0)
        const types = s?.vehicleTypes || []
        const typeAt = (i: number) => types[i] || types[0] || 'camioGran'
        if ((block.vehicleTrips || []).length === 0 && fromQuadrant > 0) {
          block = {
            ...block,
            vehicleTrips: Array.from({ length: fromQuadrant }, (_, i) =>
              newVehicleTripLine({ vehicleType: typeAt(i) })
            ),
          }
        }

        const tripKm = kmByDept[dept]
        const hasTripKm = (block.vehicleTrips || []).some(
          (t) =>
            (Number(t.kmOutbound) || 0) > 0 ||
            (Number(t.kmReturn) || 0) > 0 ||
            (Number(t.kmTotal) || 0) > 0
        )
        const vehicleCount = Math.max(fromQuadrant, (block.vehicleTrips || []).length)
        if (tripKm && tripKm.kmTotal > 0 && !hasTripKm && vehicleCount > 0) {
          block = {
            ...block,
            vehicleTrips: Array.from({ length: vehicleCount }, (_, i) =>
              newVehicleTripLine({
                ...(block.vehicleTrips?.[i] || {}),
                vehicleType: block.vehicleTrips?.[i]?.vehicleType || typeAt(i),
                kmOutbound: tripKm.kmOutbound,
                kmReturn: tripKm.kmReturn,
                kmTotal: tripKm.kmTotal,
              })
            ),
          }
        }

        const summary = summarizeDepartmentBlock(
          block,
          dept,
          config.hourlyRates,
          config.fuel
        )
        detailByDepartment[dept] = {
          ...summary,
          vehicleCount: s?.vehicleCount ?? summary.vehicleCount,
        }
        byDepartment[dept] = summary.subtotal
      }

      const operationalTotal =
        Math.round(
          COST_SERVEIS_DEPARTMENTS.reduce((s, d) => s + byDepartment[d], 0) * 100
        ) / 100
      const fixed = Math.max(0, Number(sheet?.fixedSalaryAllocated) || 0)
      const total = Math.round((operationalTotal + fixed) * 100) / 100
      const pctOfBilling =
        billing > 0 ? Math.round((total / billing) * 10000) / 10000 : null

      const serviceType = readServiceType(d)
      const spaceKind = resolveSpaceKind(spaceIndex, {
        fincaId: d.FincaId ? String(d.FincaId) : null,
        fincaCode: d.FincaCode ? String(d.FincaCode) : null,
        ubicacioCode: d.UbicacioCode ? String(d.UbicacioCode) : null,
        location,
        eventName,
      })
      return {
        eventId: doc.id,
        eventName,
        eventDate,
        ln: String(d.LN || ''),
        location,
        serviceType,
        spaceKind,
        serviceInCatalog: allServiceTypesInCatalog(serviceType, catalogIndex),
        billing,
        numPax: Number(d.NumPax ?? 0) || 0,
        hasSheet: Boolean(sheet),
        operationalTotal,
        total,
        pctOfBilling,
        byDepartment,
        detailByDepartment,
      } satisfies ServiceCostListItem
    })
    .filter(Boolean) as ServiceCostListItem[]

  items.sort(
    (a, b) => a.eventDate.localeCompare(b.eventDate) || a.eventName.localeCompare(b.eventName)
  )

  const weightRows = await listServeiWeightRows({ dept: 'all' })
  const byYm = new Map<string, ServiceCostListItem[]>()
  for (const item of items) {
    const ym = item.eventDate.slice(0, 7)
    if (!byYm.has(ym)) byYm.set(ym, [])
    byYm.get(ym)!.push(item)
  }
  for (const [ym, group] of byYm) {
    const [y, m] = ym.split('-').map(Number)
    if (!y || !m) continue
    const opsia = await getOpsiaMonthDoc(y, m)
    if (!opsia?.departments) continue

    for (const dept of PONDERACIO_DEPTS) {
      const potsRaw = resolveStructurePots(opsia.departments[dept])
      if (!potsRaw) continue
      const pots = applyManualDeductionsToPots(
        potsRaw,
        manualDeductionsByYm.get(ym)?.[dept] || null
      )

      const quotas = allocateStructurePotsToEvents({
        pots,
        events: group.map((g) => ({
          eventId: g.eventId,
          serviceType: g.serviceType,
          numPax: g.numPax,
          spaceKind: g.spaceKind,
        })),
        catalog: catalogIndex,
        weightRows,
        dept,
      })

      for (const item of group) {
        const q = quotas.get(item.eventId)
        if (!q) continue
        const detail = item.detailByDepartment[dept]
        if (!detail) continue
        const base =
          (Number(detail.laborCost) || 0) +
          (Number(detail.fuelCost) || 0) +
          (Number(detail.extras) || 0)
        detail.managementCost = q.managementCost
        detail.preparationCost = q.preparationCost
        detail.washingCost = q.washingCost
        detail.subtotal =
          Math.round(
            (base + q.managementCost + q.preparationCost + q.washingCost) * 100
          ) / 100
        item.byDepartment[dept] = detail.subtotal
      }
    }

    for (const item of group) {
      const prevFixed = Math.max(
        0,
        Math.round(((item.total || 0) - (item.operationalTotal || 0)) * 100) / 100
      )
      item.operationalTotal =
        Math.round(
          COST_SERVEIS_DEPARTMENTS.reduce((s, d) => s + (item.byDepartment[d] || 0), 0) *
            100
        ) / 100
      item.total = Math.round((item.operationalTotal + prevFixed) * 100) / 100
      item.pctOfBilling =
        item.billing > 0
          ? Math.round((item.total / item.billing) * 10000) / 10000
          : null
    }
  }

  const missingByType = new Map<string, number>()
  for (const row of items) {
    const parts = splitServiceTypeLabels(row.serviceType)
    if (parts.length === 0) {
      missingByType.set('(sense tipus)', (missingByType.get('(sense tipus)') || 0) + 1)
      continue
    }
    for (const part of parts) {
      if (matchServeiCatalogId(part, catalogIndex)) continue
      missingByType.set(part, (missingByType.get(part) || 0) + 1)
    }
  }
  const missingServiceTypes = Array.from(missingByType.entries())
    .map(([nom, count]) => ({ nom, count }))
    .sort((a, b) => b.count - a.count || a.nom.localeCompare(b.nom, 'ca'))

  return {
    items,
    manuals,
    missingServiceTypes,
    maps: {
      locations: uniqueKeys.length,
      resolved: mapsResolved,
      computedThisRequest: mapsComputed,
      hasApiKey: Boolean(
        process.env.GOOGLE_MAPS_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.NEXT_PUBLIC_GOOGLE_API_KEY
      ),
    },
  }
}

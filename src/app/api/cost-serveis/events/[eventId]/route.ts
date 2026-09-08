import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { emptyDepartments } from '@/lib/costServeis/defaults'
import { getServiceCostConfig, getServiceCostSheet, upsertServiceCostSheet } from '@/lib/costServeis/store'
import { recomputeSheet } from '@/lib/costServeis/calc'
import {
  applyQuadrantStaffing,
  normalizeClockTime,
  staffingByCostDeptForEvent,
} from '@/lib/costServeis/quadrantPeople'
import {
  applyKmToSheetDepartments,
  computeKmByDepartment,
  persistSheetDistancesToCache,
} from '@/lib/costServeis/applyDepartureKm'
import { resolveGoogleMapsApiKey } from '@/lib/costServeis/googleMapsDistance'
import type { ServiceCostSheet } from '@/lib/costServeis/types'
import { getOpsiaMonthDoc } from '@/lib/costServeis/opsiaFinance'
import { listServeiWeightRows, PONDERACIO_DEPTS } from '@/lib/costServeis/serveiWeights'
import {
  allocateStructurePotsToEvents,
  applyStructureQuotasToSheet,
  resolveStructurePots,
} from '@/lib/costServeis/allocateStructure'
import { listServeis } from '@/lib/serveis/server'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import {
  applyManualDeductionsToPots,
  listManualServicesByDateRange,
  sumManualPotDeductions,
} from '@/lib/costServeis/manualServices'
import {
  isIsoDateDayParam,
  queryStageCollectionDocsInDateRange,
} from '@/lib/firestoreStageRangeQuery'

export const runtime = 'nodejs'

const MODULE_PATH = '/menu/cost-serveis'

function dayKey(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  try {
    return new Date(String(v)).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function readServiceType(d: Record<string, unknown>): string {
  return String(
    d.Servei || d.Servicio || d.service || d.TipusServei || d.tipusServei || d.serviceType || ''
  ).trim()
}

function readEventEndTime(d: Record<string, unknown>): string {
  return normalizeClockTime(String(d.HoraFi ?? d.horaFi ?? d.endTime ?? ''))
}

function readEventStartTime(d: Record<string, unknown>): string {
  return normalizeClockTime(
    String(d.HoraInici ?? d.horaInici ?? d.Hora ?? d.hora ?? d.startTime ?? '')
  )
}

async function loadEventMeta(eventId: string) {
  const snap = await db.collection('stage_verd').doc(eventId).get()
  if (!snap.exists) return null
  const d = (snap.data() || {}) as Record<string, unknown>
  return {
    eventId,
    eventName: String(d.NomEvent || d.summary || 'Sense nom'),
    eventDate: dayKey(d.DataInici),
    ln: String(d.LN || ''),
    location: String(d.Ubicacio || ''),
    serviceType: readServiceType(d),
    eventEndTime: readEventEndTime(d),
    eventStartTime: readEventStartTime(d),
    fincaId: d.FincaId ? String(d.FincaId) : null,
    fincaCode: d.FincaCode ? String(d.FincaCode) : null,
    ubicacioCode: d.UbicacioCode ? String(d.UbicacioCode) : null,
    numPax: Number(d.NumPax ?? 0) || 0,
    billing: Number(d.Import ?? 0) || 0,
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canView = await canViewUiPath({ user: auth.user, path: MODULE_PATH })
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { eventId } = await ctx.params
  const meta = await loadEventMeta(eventId)
  if (!meta) {
    return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
  }

  const [existing, config, staffing, spaceIndex] = await Promise.all([
    getServiceCostSheet(eventId),
    getServiceCostConfig(),
    staffingByCostDeptForEvent(eventId, meta.eventEndTime, meta.eventStartTime),
    loadSpaceOwnershipIndex(),
  ])
  const spaceKind = resolveSpaceKind(spaceIndex, {
    fincaId: meta.fincaId,
    fincaCode: meta.fincaCode,
    ubicacioCode: meta.ubicacioCode,
    location: meta.location,
    eventName: meta.eventName,
  })
  const base: ServiceCostSheet = existing || {
    eventId: meta.eventId,
    eventName: meta.eventName,
    eventDate: meta.eventDate,
    ln: meta.ln,
    location: meta.location,
    serviceType: meta.serviceType,
    fincaId: meta.fincaId,
    fincaCode: meta.fincaCode,
    spaceKind,
    numPax: meta.numPax,
    billing: meta.billing,
    departments: emptyDepartments(),
    fixedSalaryAllocated: 0,
    operationalTotal: 0,
    total: 0,
    pctOfBilling: null,
  }

  const withStaffing = applyQuadrantStaffing(
    {
      ...base,
      eventName: meta.eventName,
      eventDate: meta.eventDate,
      ln: meta.ln,
      location: meta.location,
      serviceType: meta.serviceType,
      fincaId: meta.fincaId,
      fincaCode: meta.fincaCode,
      spaceKind,
      numPax: meta.numPax,
      billing: meta.billing,
    },
    staffing
  )

  // 1) Firestore  2) si falta → Google un cop  3) desa a Firestore
  const kmByDept = await computeKmByDepartment({
    departures: config.departures,
    destination: meta.location,
    destinationHint: meta.eventName,
    roundTripDefault: config.fuel.roundTripDefault,
  })

  const withKm = applyKmToSheetDepartments(withStaffing, kmByDept, {
    vehicleCountByDept: {
      logistica: staffing.logistica.vehicleCount,
      serveis: staffing.serveis.vehicleCount,
      cuina: staffing.cuina.vehicleCount,
    },
    vehicleTypesByDept: {
      logistica: staffing.logistica.vehicleTypes,
      serveis: staffing.serveis.vehicleTypes,
      cuina: staffing.cuina.vehicleTypes,
    },
    fuel: config.fuel,
  })

  let sheet = recomputeSheet(withKm, config.hourlyRates, config.fuel)

  // Gestió / prep / rentat: mateix repartiment que la llista (pots mes + ponderació)
  try {
    const ym = meta.eventDate.slice(0, 7)
    const [y, m] = ym.split('-').map(Number)
    if (y && m) {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const from = `${ym}-01`
      const to = `${ym}-${String(last).padStart(2, '0')}`
      if (isIsoDateDayParam(from) && isIsoDateDayParam(to)) {
        const [opsia, catalog, weightRows, stageDocs, monthManuals] = await Promise.all([
          getOpsiaMonthDoc(y, m),
          listServeis(),
          listServeiWeightRows({ dept: 'all' }),
          queryStageCollectionDocsInDateRange(db, 'stage_verd', from, to),
          listManualServicesByDateRange(from, to),
        ])
        if (opsia?.departments) {
          const catalogIndex = catalog.map((s) => ({
            id: s.id,
            nom: s.nom,
            codi: s.codi,
          }))
          const monthDeductions = sumManualPotDeductions(monthManuals).get(ym)
          const monthEvents = stageDocs.map((doc) => {
            const d = doc.data() as Record<string, unknown>
            const location = String(d.Ubicacio || '')
            const eventName = String(d.NomEvent || d.summary || '')
            return {
              eventId: doc.id,
              serviceType: readServiceType(d),
              numPax: Number(d.NumPax ?? 0) || 0,
              spaceKind: resolveSpaceKind(spaceIndex, {
                fincaId: d.FincaId ? String(d.FincaId) : null,
                fincaCode: d.FincaCode ? String(d.FincaCode) : null,
                ubicacioCode: d.UbicacioCode ? String(d.UbicacioCode) : null,
                location,
                eventName,
              }),
            }
          })
          if (!monthEvents.some((e) => e.eventId === meta.eventId)) {
            monthEvents.push({
              eventId: meta.eventId,
              serviceType: meta.serviceType,
              numPax: meta.numPax,
              spaceKind,
            })
          }

          const quotasByDept: Partial<
            Record<(typeof PONDERACIO_DEPTS)[number], { managementCost: number; preparationCost: number; washingCost: number }>
          > = {}
          for (const dept of PONDERACIO_DEPTS) {
            const potsRaw = resolveStructurePots(opsia.departments[dept])
            if (!potsRaw) continue
            // Conserva valors desats si ja hi ha gestió/prep/rentat > 0
            const prev = sheet.departments[dept]
            if (
              existing &&
              prev &&
              ((prev.managementCost || 0) > 0 ||
                (prev.preparationCost || 0) > 0 ||
                (prev.washingCost || 0) > 0)
            ) {
              continue
            }
            const pots = applyManualDeductionsToPots(
              potsRaw,
              monthDeductions?.[dept] || null
            )
            const quotas = allocateStructurePotsToEvents({
              pots,
              events: monthEvents,
              catalog: catalogIndex,
              weightRows,
              dept,
            })
            const q = quotas.get(meta.eventId)
            if (q) quotasByDept[dept] = q
          }
          if (Object.keys(quotasByDept).length > 0) {
            sheet = applyStructureQuotasToSheet(
              sheet,
              quotasByDept,
              config.hourlyRates,
              config.fuel
            )
          }
        }
      }
    }
  } catch (err) {
    console.error('[cost-serveis event GET structure]', err)
  }

  void persistSheetDistancesToCache({
    departures: config.departures,
    destination: meta.location,
    destinationHint: meta.eventName,
    departments: sheet.departments,
  })

  return NextResponse.json({
    sheet,
    config,
    staffingFromQuadrants: staffing,
    kmFromMaps: kmByDept,
    kmDebug: {
      location: meta.location,
      eventName: meta.eventName,
      resolvedDepts: Object.keys(kmByDept),
      hasApiKey: Boolean(resolveGoogleMapsApiKey()),
    },
  })
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ eventId: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const canEdit = await canEditUiPath({ user: auth.user, path: `${MODULE_PATH}/edicio` })
  if (!canEdit) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { eventId } = await ctx.params
  const meta = await loadEventMeta(eventId)
  if (!meta) {
    return NextResponse.json({ error: 'Esdeveniment no trobat' }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as Partial<ServiceCostSheet> | null
  if (!body?.departments) {
    return NextResponse.json({ error: 'Falten departments' }, { status: 400 })
  }

  const [staffing, config, spaceIndex] = await Promise.all([
    staffingByCostDeptForEvent(eventId, meta.eventEndTime, meta.eventStartTime),
    getServiceCostConfig(),
    loadSpaceOwnershipIndex(),
  ])

  const sheet: ServiceCostSheet = applyQuadrantStaffing(
    {
      eventId,
      eventName: meta.eventName,
      eventDate: meta.eventDate,
      ln: meta.ln,
      location: meta.location,
      serviceType: meta.serviceType,
      fincaId: meta.fincaId,
      fincaCode: meta.fincaCode,
      spaceKind: resolveSpaceKind(spaceIndex, {
        fincaId: meta.fincaId,
        fincaCode: meta.fincaCode,
        ubicacioCode: meta.ubicacioCode,
        location: meta.location,
        eventName: meta.eventName,
      }),
      numPax: meta.numPax,
      billing: meta.billing,
      departments: {
        ...emptyDepartments(),
        ...body.departments,
      },
      fixedSalaryAllocated: Number(body.fixedSalaryAllocated) || 0,
      operationalTotal: 0,
      total: 0,
      pctOfBilling: null,
    },
    staffing
  )

  // En desar: no recalcular amb Google; usa cache + el que ja hi ha a la fitxa
  const kmByDept = await computeKmByDepartment({
    departures: config.departures,
    destination: meta.location,
    destinationHint: meta.eventName,
    roundTripDefault: config.fuel.roundTripDefault,
    cacheOnly: true,
  })

  const withVehicles = applyKmToSheetDepartments(sheet, kmByDept, {
    vehicleCountByDept: {
      logistica: staffing.logistica.vehicleCount,
      serveis: staffing.serveis.vehicleCount,
      cuina: staffing.cuina.vehicleCount,
    },
    vehicleTypesByDept: {
      logistica: staffing.logistica.vehicleTypes,
      serveis: staffing.serveis.vehicleTypes,
      cuina: staffing.cuina.vehicleTypes,
    },
    fuel: config.fuel,
  })

  const saved = await upsertServiceCostSheet(withVehicles, auth.user.id)

  // Desa km de la fitxa a la taula (per a la llista)
  void persistSheetDistancesToCache({
    departures: config.departures,
    destination: meta.location,
    destinationHint: meta.eventName,
    departments: saved.departments,
  })

  return NextResponse.json({ sheet: saved })
}

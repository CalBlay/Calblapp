/**
 * Serveis manuals (altres LN: Restaurants, Precuinats, ATMETLLER…).
 * No venen de stage_verd. Gestió/prep/rentat es resten dels pots Opsia
 * abans de repartir als events. El combustible no es resta.
 *
 * Gestió/prep/rentat s’entren en hores × preu/hora (config) i resten dels pots.
 * Cost conductor = personal × hores × €/h (visible al total; NO resta dels pots).
 * Km: cache Firestore → Google Maps. Combustible: km × L/100 × €/L del tipus.
 */

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  COST_SERVEIS_DEPARTMENTS,
  type CostServeisDepartment,
  type ServiceCostConfig,
} from '@/lib/costServeis/types'
import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'
import { resolveSpaceKind } from '@/lib/costServeis/spaceOwnership'
import { loadSpaceOwnershipIndex } from '@/lib/costServeis/loadSpaceOwnership'
import type { StructurePots } from '@/lib/costServeis/allocateStructure'
import type { PonderacioDept } from '@/lib/costServeis/serveiWeights'
import { PONDERACIO_DEPTS } from '@/lib/costServeis/serveiWeights'
import { getServiceCostConfig } from '@/lib/costServeis/store'
import { computeKmByDepartment } from '@/lib/costServeis/applyDepartureKm'
import { fuelCostForTrip } from '@/lib/costServeis/calc'
import { normalizeTransportType } from '@/lib/transportTypes'
import { normalizeManualLnName } from '@/lib/costServeis/manualLnOptions'

export const SERVICE_COST_MANUAL_COL = 'serviceCostManualServices'

export type ManualServiceOrigin = 'edicio' | 'disponibilitat'

export type ManualServiceLine = {
  id: string
  /** Distingeix de files d’event a la UI. */
  source: 'manual'
  /** D’on s’ha creat la línia. */
  origin: ManualServiceOrigin
  /** Si ve de Logística → Disponibilitat. */
  transportAssignmentId?: string | null
  eventDate: string
  eventName: string
  ln: string
  location: string
  serviceType: string
  /** Dept dels pots Opsia que es veuen afectats (logística / cuina). */
  dept: CostServeisDepartment
  spaceKind: SpaceKind | null
  fincaId?: string | null
  peopleCount: number
  hours: number
  vehicleCount: number
  /** Tipus de vehicle (config combustible). */
  vehicleType: string
  kmTotal: number
  /** Cost conductor/personal operatiu: personal × hores × €/h. NO resta dels pots. */
  laborCost: number
  /** Informatiu / cost de la fila; NO es resta dels pots. */
  fuelCost: number
  /** Hores d’estructura → cost = hores × hourlyRates[dept]. */
  managementHours: number
  preparationHours: number
  washingHours: number
  /** € calculats → resten del pot gestió. */
  managementCost: number
  /** € calculats → resten del pot preparació. */
  preparationCost: number
  /** € calculats → resten del pot rentat. */
  washingCost: number
  billing: number
  /** labor + gestió + prep + rentat + combustible */
  total: number
  notes: string
  updatedAt: string
  updatedBy?: string
}

export type ManualServiceInput = {
  eventDate: string
  eventName: string
  ln?: string
  location?: string
  serviceType?: string
  dept: CostServeisDepartment
  spaceKind?: SpaceKind | null
  fincaId?: string | null
  origin?: ManualServiceOrigin
  transportAssignmentId?: string | null
  peopleCount?: number
  hours?: number
  vehicleCount?: number
  vehicleType?: string
  kmTotal?: number
  fuelCost?: number
  managementHours?: number
  preparationHours?: number
  washingHours?: number
  managementCost?: number
  preparationCost?: number
  washingCost?: number
  billing?: number
  notes?: string
  /** Si true (defecte), recalcula km (cache/Google) i combustible. */
  autoKm?: boolean
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function n(v: unknown) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

export function computeManualTotal(row: {
  laborCost?: number
  managementCost?: number
  preparationCost?: number
  washingCost?: number
  fuelCost?: number
}): number {
  return round2(
    Math.max(0, n(row.laborCost)) +
      Math.max(0, n(row.managementCost)) +
      Math.max(0, n(row.preparationCost)) +
      Math.max(0, n(row.washingCost)) +
      Math.max(0, n(row.fuelCost))
  )
}

export function structureCostFromHours(hours: number, hourlyRate: number): number {
  return round2(Math.max(0, hours) * Math.max(0, hourlyRate))
}

/** Cost operatiu del conductor / personal: personal × hores × €/h. */
export function laborCostFromPeopleHours(
  peopleCount: number,
  hours: number,
  hourlyRate: number
): number {
  return round2(
    Math.max(0, peopleCount) * Math.max(0, hours) * Math.max(0, hourlyRate)
  )
}

export async function estimateManualTrip(opts: {
  dept: CostServeisDepartment
  location: string
  vehicleType?: string
  vehicleCount?: number
  cacheOnly?: boolean
  config?: ServiceCostConfig
}): Promise<{
  kmOneWay: number
  kmTotal: number
  fuelCost: number
  hourlyRate: number
  source: 'cache' | 'computed' | 'none'
}> {
  const config = opts.config || (await getServiceCostConfig())
  const hourlyRate = Math.max(0, n(config.hourlyRates[opts.dept]) || 18)
  const location = String(opts.location || '').trim()
  const vehicleCount = Math.max(1, Math.round(n(opts.vehicleCount) || 1))
  const vehicleType = String(opts.vehicleType || '').trim()

  if (!location) {
    return {
      kmOneWay: 0,
      kmTotal: 0,
      fuelCost: 0,
      hourlyRate,
      source: 'none',
    }
  }

  const kmByDept = await computeKmByDepartment({
    departures: config.departures,
    destination: location,
    roundTripDefault: config.fuel.roundTripDefault !== false,
    cacheOnly: opts.cacheOnly,
  })
  const trip = kmByDept[opts.dept]
  const kmOneWay = trip?.kmOutbound || 0
  const routeKm = trip?.kmTotal || 0
  const kmTotal = round2(routeKm * vehicleCount)

  let fuelCost = 0
  if (vehicleType && kmTotal > 0) {
    const rate = config.fuel.byVehicleType[vehicleType] || {
      litersPer100km: 12,
      pricePerLiter: 1.47,
    }
    fuelCost = fuelCostForTrip(kmTotal, rate.litersPer100km, rate.pricePerLiter)
  }

  return {
    kmOneWay,
    kmTotal,
    fuelCost,
    hourlyRate,
    source: routeKm > 0 ? (opts.cacheOnly ? 'cache' : 'computed') : 'none',
  }
}

async function resolveManualSpaceKind(input: {
  fincaId?: string | null
  location?: string
  eventName?: string
  spaceKind?: SpaceKind | null
}): Promise<SpaceKind | null> {
  if (input.spaceKind === 'Propi' || input.spaceKind === 'Extern') {
    return input.spaceKind
  }
  try {
    const ownership = await loadSpaceOwnershipIndex()
    return resolveSpaceKind(ownership, {
      fincaId: input.fincaId,
      location: input.location,
      eventName: input.eventName || input.location,
    })
  } catch {
    return null
  }
}

function mapDoc(
  id: string,
  data: Record<string, unknown>,
  hourlyRate?: number
): ManualServiceLine {
  const deptRaw = String(data.dept || 'logistica')
  const dept = (COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(deptRaw)
    ? (deptRaw as CostServeisDepartment)
    : 'logistica'
  const peopleCount = Math.max(0, n(data.peopleCount))
  const hours = Math.max(0, n(data.hours))
  const managementHours = Math.max(0, n(data.managementHours))
  const preparationHours = Math.max(0, n(data.preparationHours))
  const washingHours = Math.max(0, n(data.washingHours))
  const managementCost = Math.max(0, n(data.managementCost))
  const preparationCost = Math.max(0, n(data.preparationCost))
  const washingCost = Math.max(0, n(data.washingCost))
  const fuelCost = Math.max(0, n(data.fuelCost))
  const rate = Math.max(0, n(hourlyRate) || n(data.hourlyRateUsed) || 18)
  const laborCost = laborCostFromPeopleHours(peopleCount, hours, rate)
  const spaceRaw = String(data.spaceKind || '').trim()
  const spaceKind =
    spaceRaw === 'Propi' || spaceRaw === 'Extern' ? (spaceRaw as SpaceKind) : null

  return {
    id,
    source: 'manual',
    origin: data.origin === 'disponibilitat' ? 'disponibilitat' : 'edicio',
    transportAssignmentId: data.transportAssignmentId
      ? String(data.transportAssignmentId)
      : null,
    eventDate: String(data.eventDate || '').slice(0, 10),
    eventName: String(data.eventName || '').trim() || 'Sense nom',
    ln: normalizeManualLnName(String(data.ln || '')),
    location: String(data.location || '').trim(),
    serviceType: String(data.serviceType || '').trim(),
    dept,
    spaceKind,
    fincaId: data.fincaId ? String(data.fincaId) : null,
    peopleCount,
    hours,
    vehicleCount: Math.max(0, n(data.vehicleCount)),
    vehicleType: String(data.vehicleType || '').trim(),
    kmTotal: Math.max(0, n(data.kmTotal)),
    laborCost,
    fuelCost,
    managementHours,
    preparationHours,
    washingHours,
    managementCost,
    preparationCost,
    washingCost,
    billing: Math.max(0, n(data.billing)),
    total: computeManualTotal({
      laborCost,
      managementCost,
      preparationCost,
      washingCost,
      fuelCost,
    }),
    notes: String(data.notes || ''),
    updatedAt: String(data.updatedAt || ''),
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
  }
}

async function buildManualPayload(
  input: ManualServiceInput,
  userId: string,
  prev?: ManualServiceLine | null
): Promise<Record<string, unknown>> {
  const eventDate = String(input.eventDate || prev?.eventDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error('Data invàlida (YYYY-MM-DD)')
  }

  const eventName =
    input.eventName != null
      ? String(input.eventName).trim() || prev?.eventName || ''
      : prev?.eventName || ''
  if (!eventName) throw new Error('Cal el nom del servei')

  const deptRaw = input.dept || prev?.dept || 'logistica'
  if (!(COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(deptRaw)) {
    throw new Error('Departament invàlid')
  }
  const dept = deptRaw as CostServeisDepartment

  const location =
    input.location != null ? String(input.location).trim() : prev?.location || ''
  const fincaId =
    input.fincaId !== undefined ? input.fincaId || null : prev?.fincaId || null
  const vehicleTypeRaw =
    input.vehicleType != null
      ? String(input.vehicleType).trim()
      : prev?.vehicleType || ''
  const vehicleType = normalizeTransportType(vehicleTypeRaw) || vehicleTypeRaw
  const vehicleCount =
    input.vehicleCount != null
      ? Math.max(0, n(input.vehicleCount))
      : prev?.vehicleCount ?? (vehicleType ? 1 : 0)

  const managementHours =
    input.managementHours != null
      ? Math.max(0, n(input.managementHours))
      : prev?.managementHours ?? 0
  const preparationHours =
    input.preparationHours != null
      ? Math.max(0, n(input.preparationHours))
      : prev?.preparationHours ?? 0
  const washingHours =
    input.washingHours != null
      ? Math.max(0, n(input.washingHours))
      : prev?.washingHours ?? 0

  const config = await getServiceCostConfig()
  const hourlyRate = Math.max(0, n(config.hourlyRates[dept]) || 18)

  // Hores són la font de veritat quan s’envien; legacy: conservar € si no hi ha hores.
  const hasHourInputs =
    input.managementHours != null ||
    input.preparationHours != null ||
    input.washingHours != null ||
    managementHours > 0 ||
    preparationHours > 0 ||
    washingHours > 0 ||
    !prev

  const managementCost = hasHourInputs
    ? structureCostFromHours(managementHours, hourlyRate)
    : input.managementCost != null
      ? Math.max(0, n(input.managementCost))
      : prev?.managementCost ?? 0
  const preparationCost = hasHourInputs
    ? structureCostFromHours(preparationHours, hourlyRate)
    : input.preparationCost != null
      ? Math.max(0, n(input.preparationCost))
      : prev?.preparationCost ?? 0
  const washingCost = hasHourInputs
    ? structureCostFromHours(washingHours, hourlyRate)
    : input.washingCost != null
      ? Math.max(0, n(input.washingCost))
      : prev?.washingCost ?? 0

  const autoKm = input.autoKm !== false
  let kmTotal =
    input.kmTotal != null ? Math.max(0, n(input.kmTotal)) : prev?.kmTotal ?? 0
  let fuelCost =
    input.fuelCost != null ? Math.max(0, n(input.fuelCost)) : prev?.fuelCost ?? 0

  if (autoKm && location) {
    const estimate = await estimateManualTrip({
      dept,
      location,
      vehicleType,
      vehicleCount: Math.max(1, vehicleCount || 1),
      config,
    })
    if (estimate.kmTotal > 0) {
      kmTotal = estimate.kmTotal
      fuelCost = estimate.fuelCost
    } else if (vehicleType && kmTotal > 0) {
      const rate = config.fuel.byVehicleType[vehicleType] || {
        litersPer100km: 12,
        pricePerLiter: 1.47,
      }
      fuelCost = fuelCostForTrip(kmTotal, rate.litersPer100km, rate.pricePerLiter)
    }
  } else if (vehicleType && kmTotal > 0) {
    const rate = config.fuel.byVehicleType[vehicleType] || {
      litersPer100km: 12,
      pricePerLiter: 1.47,
    }
    fuelCost = fuelCostForTrip(kmTotal, rate.litersPer100km, rate.pricePerLiter)
  }

  const peopleCount =
    input.peopleCount != null
      ? Math.max(0, n(input.peopleCount))
      : prev?.peopleCount ?? 0
  const hours =
    input.hours != null ? Math.max(0, n(input.hours)) : prev?.hours ?? 0
  const laborCost = laborCostFromPeopleHours(peopleCount, hours, hourlyRate)

  const spaceKind = await resolveManualSpaceKind({
    fincaId,
    location,
    eventName,
    spaceKind: input.spaceKind !== undefined ? input.spaceKind : prev?.spaceKind,
  })

  return {
    eventDate,
    eventName,
    ln: input.ln != null ? normalizeManualLnName(String(input.ln)) : prev?.ln || '',
    location,
    serviceType:
      input.serviceType != null
        ? String(input.serviceType).trim()
        : prev?.serviceType || '',
    dept,
    spaceKind,
    fincaId,
    origin: prev?.origin || (input.origin === 'disponibilitat' ? 'disponibilitat' : 'edicio'),
    transportAssignmentId:
      prev?.transportAssignmentId || input.transportAssignmentId || null,
    peopleCount,
    hours,
    vehicleCount,
    vehicleType,
    kmTotal,
    laborCost,
    fuelCost,
    hourlyRateUsed: hourlyRate,
    managementHours,
    preparationHours,
    washingHours,
    managementCost,
    preparationCost,
    washingCost,
    billing:
      input.billing != null ? Math.max(0, n(input.billing)) : prev?.billing ?? 0,
    notes: input.notes != null ? String(input.notes) : prev?.notes || '',
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  }
}

export async function listManualServicesByDateRange(
  from: string,
  to: string
): Promise<ManualServiceLine[]> {
  const [snap, config] = await Promise.all([
    db
      .collection(SERVICE_COST_MANUAL_COL)
      .where('eventDate', '>=', from)
      .where('eventDate', '<=', to)
      .get(),
    getServiceCostConfig(),
  ])

  const rows = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const deptRaw = String(data.dept || 'logistica')
    const dept = (COST_SERVEIS_DEPARTMENTS as readonly string[]).includes(deptRaw)
      ? (deptRaw as CostServeisDepartment)
      : 'logistica'
    const rate = Math.max(0, n(config.hourlyRates[dept]) || 18)
    return mapDoc(d.id, data, rate)
  })
  return rows.sort(
    (a, b) =>
      a.eventDate.localeCompare(b.eventDate) ||
      a.eventName.localeCompare(b.eventName, 'ca', { sensitivity: 'base' })
  )
}

export async function getManualService(
  id: string
): Promise<ManualServiceLine | null> {
  const snap = await db.collection(SERVICE_COST_MANUAL_COL).doc(id).get()
  if (!snap.exists) return null
  return mapDoc(snap.id, snap.data() as Record<string, unknown>)
}

export async function createManualService(
  input: ManualServiceInput,
  userId: string
): Promise<ManualServiceLine> {
  const payload = {
    ...(await buildManualPayload(input, userId, null)),
    createdAt: new Date().toISOString(),
  }
  const ref = await db.collection(SERVICE_COST_MANUAL_COL).add(payload)
  return mapDoc(ref.id, payload, n(payload.hourlyRateUsed) || undefined)
}

export async function updateManualService(
  id: string,
  input: Partial<ManualServiceInput>,
  userId: string
): Promise<ManualServiceLine> {
  const ref = db.collection(SERVICE_COST_MANUAL_COL).doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Servei manual no trobat')
  const prev = mapDoc(id, snap.data() as Record<string, unknown>)

  const payload = await buildManualPayload(
    {
      eventDate: input.eventDate || prev.eventDate,
      eventName: input.eventName ?? prev.eventName,
      dept: input.dept || prev.dept,
      ...input,
    },
    userId,
    prev
  )

  await ref.set(payload, { merge: true })
  return mapDoc(id, payload, n(payload.hourlyRateUsed) || undefined)
}

export async function deleteManualService(id: string): Promise<void> {
  await db.collection(SERVICE_COST_MANUAL_COL).doc(id).delete()
}

/**
 * Suma gestió/prep/rentat dels manuals per mes i dept (només logistica/cuina).
 * El combustible no s’inclou.
 */
export function sumManualPotDeductions(
  manuals: ManualServiceLine[]
): Map<string, Partial<Record<PonderacioDept, StructurePots>>> {
  const byYm = new Map<string, Partial<Record<PonderacioDept, StructurePots>>>()

  for (const row of manuals) {
    if (!(PONDERACIO_DEPTS as readonly string[]).includes(row.dept)) continue
    const dept = row.dept as PonderacioDept
    const ym = row.eventDate.slice(0, 7)
    if (!ym) continue
    if (!byYm.has(ym)) byYm.set(ym, {})
    const month = byYm.get(ym)!
    const prev = month[dept] || { gestio: 0, preparacio: 0, rentat: 0 }
    month[dept] = {
      gestio: round2(prev.gestio + row.managementCost),
      preparacio: round2(prev.preparacio + row.preparationCost),
      rentat: round2(prev.rentat + row.washingCost),
    }
  }
  return byYm
}

/** Resta les deduccions manuals d’un pot (mínim 0). */
export function applyManualDeductionsToPots(
  pots: StructurePots,
  deduction?: StructurePots | null
): StructurePots {
  if (!deduction) return pots
  return {
    gestio: round2(Math.max(0, pots.gestio - (deduction.gestio || 0))),
    preparacio: round2(Math.max(0, pots.preparacio - (deduction.preparacio || 0))),
    rentat: round2(Math.max(0, pots.rentat - (deduction.rentat || 0))),
  }
}

import type {
  CostServeisDepartment,
  DepartmentCostBlock,
  FuelConfig,
  HourlyRateByDept,
  ServiceCostDeptSummary,
  ServiceCostSheet,
  VehicleTripLine,
} from './types'
import { COST_SERVEIS_DEPARTMENTS } from './types'
import { normalizeDepartmentBlock, newVehicleTripLine } from './defaults'

/** Diferència en hores entre HH:mm (suporta creuar mitjanit). */
export function hoursBetween(callTime: string, closeTime: string): number {
  const parse = (t: string) => {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const a = parse(callTime)
  const b = parse(closeTime)
  if (a == null || b == null) return 0
  let diff = b - a
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

export function fuelCostForTrip(kmTotal: number, litersPer100km: number, pricePerLiter: number): number {
  if (!kmTotal || kmTotal <= 0) return 0
  const liters = (kmTotal * litersPer100km) / 100
  return Math.round(liters * pricePerLiter * 100) / 100
}

export function recomputeVehicleTrip(
  trip: VehicleTripLine,
  fuel: FuelConfig
): VehicleTripLine {
  const out = Math.max(0, Number(trip.kmOutbound) || 0)
  let ret = Math.max(0, Number(trip.kmReturn) || 0)
  if (fuel.roundTripDefault && ret === 0 && out > 0) {
    ret = out
  }
  return {
    ...trip,
    kmOutbound: out,
    kmReturn: ret,
    kmTotal: Math.round((out + ret) * 100) / 100,
  }
}

export function fuelCostForDepartment(block: DepartmentCostBlock, fuel: FuelConfig): number {
  let total = 0
  for (const trip of block.vehicleTrips || []) {
    const rate = fuel.byVehicleType[trip.vehicleType] || {
      litersPer100km: 12,
      pricePerLiter: 1.47,
    }
    total += fuelCostForTrip(trip.kmTotal, rate.litersPer100km, rate.pricePerLiter)
  }
  return Math.round(total * 100) / 100
}

export function recomputeDepartmentBlock(
  block: DepartmentCostBlock,
  dept: CostServeisDepartment,
  rates: HourlyRateByDept,
  fuel: FuelConfig
): DepartmentCostBlock {
  const next = normalizeDepartmentBlock(block)

  if (!next.hoursManual) {
    next.hours = hoursBetween(next.callTime, next.closeTime)
  }

  next.vehicleTrips = (next.vehicleTrips || []).map((t) => recomputeVehicleTrip(t, fuel))

  const people = Math.max(0, Number(next.peopleCount) || 0)
  const hours = Math.max(0, Number(next.hours) || 0)
  const rate = Number(rates[dept]) || 0
  const labor = Math.round(people * hours * rate * 100) / 100
  const fuelEur = fuelCostForDepartment(next, fuel)
  const extras = Math.max(0, Number(next.extras) || 0)
  const management = Math.max(0, Number(next.managementCost) || 0)
  const preparation = Math.max(0, Number(next.preparationCost) || 0)
  const washing = Math.max(0, Number(next.washingCost) || 0)
  next.managementCost = management
  next.preparationCost = preparation
  next.washingCost = washing
  next.subtotal = Math.round(
    (labor + fuelEur + extras + management + preparation + washing) * 100
  ) / 100
  return next
}

export function recomputeSheet(
  sheet: ServiceCostSheet,
  rates: HourlyRateByDept,
  fuel: FuelConfig
): ServiceCostSheet {
  const departments = { ...sheet.departments }
  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    departments[dept] = recomputeDepartmentBlock(
      departments[dept] || normalizeDepartmentBlock(null),
      dept,
      rates,
      fuel
    )
  }
  const operationalTotal =
    Math.round(
      COST_SERVEIS_DEPARTMENTS.reduce((s, d) => s + (departments[d]?.subtotal || 0), 0) * 100
    ) / 100
  const fixed = Math.max(0, Number(sheet.fixedSalaryAllocated) || 0)
  const total = Math.round((operationalTotal + fixed) * 100) / 100
  const billing = Number(sheet.billing) || 0
  const pctOfBilling = billing > 0 ? Math.round((total / billing) * 10000) / 10000 : null
  return {
    ...sheet,
    departments,
    operationalTotal,
    total,
    pctOfBilling,
  }
}

export function emptyDeptSummary(): ServiceCostDeptSummary {
  return {
    peopleCount: 0,
    hours: 0,
    personHours: 0,
    extras: 0,
    kmTotal: 0,
    laborCost: 0,
    fuelCost: 0,
    managementCost: 0,
    preparationCost: 0,
    washingCost: 0,
    vehicleCount: 0,
    subtotal: 0,
    vehicles: [],
  }
}

/** Resum de llista a partir d’un bloc ja recomputat. */
export function summarizeDepartmentBlock(
  block: DepartmentCostBlock | null | undefined,
  dept: CostServeisDepartment,
  rates: HourlyRateByDept,
  fuel: FuelConfig
): ServiceCostDeptSummary {
  const next = recomputeDepartmentBlock(
    block || normalizeDepartmentBlock(null),
    dept,
    rates,
    fuel
  )
  const people = Math.max(0, Number(next.peopleCount) || 0)
  const hours = Math.max(0, Number(next.hours) || 0)
  const rate = Number(rates[dept]) || 0
  const laborCost = Math.round(people * hours * rate * 100) / 100
  const fuelCost = fuelCostForDepartment(next, fuel)
  const kmTotal = Math.round(
    (next.vehicleTrips || []).reduce((s, t) => s + (Number(t.kmTotal) || 0), 0) * 100
  ) / 100

  const byType = new Map<string, { vehicleType: string; lines: number; km: number }>()
  for (const trip of next.vehicleTrips || []) {
    const key = String(trip.vehicleType || 'altre')
    const prev = byType.get(key) || { vehicleType: key, lines: 0, km: 0 }
    prev.lines += 1
    prev.km += Number(trip.kmTotal) || 0
    byType.set(key, prev)
  }

  return {
    peopleCount: people,
    hours,
    personHours: Math.round(people * hours * 100) / 100,
    extras: Math.max(0, Number(next.extras) || 0),
    kmTotal,
    laborCost,
    fuelCost,
    managementCost: Math.max(0, Number(next.managementCost) || 0),
    preparationCost: Math.max(0, Number(next.preparationCost) || 0),
    washingCost: Math.max(0, Number(next.washingCost) || 0),
    vehicleCount: (next.vehicleTrips || []).length,
    subtotal: next.subtotal,
    vehicles: Array.from(byType.values()).map((v) => ({
      ...v,
      km: Math.round(v.km * 100) / 100,
    })),
  }
}

export { newVehicleTripLine }

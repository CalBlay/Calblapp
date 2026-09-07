import { TRANSPORT_TYPE_OPTIONS, type TransportType } from '@/lib/transportTypes'
import type {
  ServiceCostConfig,
  DepartmentCostBlock,
  CostServeisDepartment,
  VehicleFuelRate,
  VehicleTripLine,
  FuelConfig,
} from './types'

/** Punts de sortida acordats (config per defecte). */
export const DEFAULT_DEPARTURE_CAL_BLAY = {
  label: 'Cal Blay · Sant Pere de Riudebitlles',
  address: "Molí d'en Vinyals 11, 08776 Sant Pere de Riudebitlles, Barcelona",
  lat: 41.4535 as number | null,
  lng: 1.7018 as number | null,
}

export const DEFAULT_DEPARTURE_ORIGENS = {
  label: 'Restaurant Orígens · Sant Sadurní d’Anoia',
  address: 'Carrer Josep Rovira 27, 08770 Sant Sadurní d’Anoia, Barcelona',
  lat: 41.4261 as number | null,
  lng: 1.7872 as number | null,
}

/** Consums orientatius L/100km per tipus (editables a config). */
const DEFAULT_LITERS_BY_TYPE: Record<TransportType, number> = {
  comercial: 7,
  transport: 9,
  furgonetaPetita: 9,
  furgonetaManteniment: 10,
  furgonetaMitjana: 11,
  furgonetaGran: 12,
  camioPPlataforma: 16,
  camioGran: 22,
  camioPPlataformaFred: 18,
  camioGranFred: 24,
}

const DEFAULT_PRICE_PER_LITER = 1.47

export function defaultFuelByVehicleType(): FuelConfig['byVehicleType'] {
  const map: FuelConfig['byVehicleType'] = {}
  for (const opt of TRANSPORT_TYPE_OPTIONS) {
    map[opt.value] = {
      litersPer100km: DEFAULT_LITERS_BY_TYPE[opt.value] ?? 12,
      pricePerLiter: DEFAULT_PRICE_PER_LITER,
    }
  }
  return map
}

export function defaultServiceCostConfig(): ServiceCostConfig {
  return {
    hourlyRates: {
      logistica: 18,
      serveis: 18,
      cuina: 18,
    },
    departures: {
      logistica: { ...DEFAULT_DEPARTURE_CAL_BLAY },
      cuina: { ...DEFAULT_DEPARTURE_CAL_BLAY },
      serveis: { ...DEFAULT_DEPARTURE_ORIGENS },
    },
    fuel: {
      roundTripDefault: true,
      byVehicleType: defaultFuelByVehicleType(),
    },
  }
}

/** Normalitza fuel antic (un sol L/100 i €/L) → per tipus de vehicle. */
export function normalizeFuelConfig(raw: unknown): FuelConfig {
  const base = defaultServiceCostConfig().fuel
  if (!raw || typeof raw !== 'object') return base
  const data = raw as Record<string, unknown>

  const roundTripDefault =
    data.roundTripDefault !== undefined ? Boolean(data.roundTripDefault) : base.roundTripDefault

  const byVehicleType = { ...base.byVehicleType }

  if (data.byVehicleType && typeof data.byVehicleType === 'object') {
    for (const [key, value] of Object.entries(data.byVehicleType as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const row = value as Partial<VehicleFuelRate>
      byVehicleType[key] = {
        litersPer100km: Number(row.litersPer100km) || byVehicleType[key]?.litersPer100km || 12,
        pricePerLiter: Number(row.pricePerLiter) || byVehicleType[key]?.pricePerLiter || DEFAULT_PRICE_PER_LITER,
      }
    }
  } else if (data.litersPer100km != null || data.pricePerLiter != null) {
    // Migració des de l’antiga config global
    const liters = Number(data.litersPer100km) || 18
    const price = Number(data.pricePerLiter) || DEFAULT_PRICE_PER_LITER
    for (const opt of TRANSPORT_TYPE_OPTIONS) {
      byVehicleType[opt.value] = { litersPer100km: liters, pricePerLiter: price }
    }
  }

  return { roundTripDefault, byVehicleType }
}

export function newVehicleTripLine(partial?: Partial<VehicleTripLine>): VehicleTripLine {
  return {
    id: partial?.id || `vt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    vehicleType: partial?.vehicleType || 'camioGran',
    kmOutbound: Number(partial?.kmOutbound) || 0,
    kmReturn: Number(partial?.kmReturn) || 0,
    kmTotal: Number(partial?.kmTotal) || 0,
  }
}

export function emptyDepartmentBlock(): DepartmentCostBlock {
  return {
    callTime: '',
    closeTime: '',
    peopleCount: 0,
    hours: 0,
    hoursManual: false,
    vehicleTrips: [],
    extras: 0,
    extrasNote: '',
    managementCost: 0,
    preparationCost: 0,
    washingCost: 0,
    subtotal: 0,
  }
}

/** Accepta blocs antics amb kmOutbound/kmReturn sense vehicleTrips. */
export function normalizeDepartmentBlock(raw: unknown): DepartmentCostBlock {
  const empty = emptyDepartmentBlock()
  if (!raw || typeof raw !== 'object') return empty
  const d = raw as Record<string, unknown>

  let vehicleTrips: VehicleTripLine[] = []
  if (Array.isArray(d.vehicleTrips)) {
    vehicleTrips = d.vehicleTrips.map((t) => newVehicleTripLine(t as Partial<VehicleTripLine>))
  } else if (d.kmOutbound != null || d.kmReturn != null || d.kmTotal != null) {
    const out = Number(d.kmOutbound) || 0
    const ret = Number(d.kmReturn) || 0
    if (out > 0 || ret > 0) {
      vehicleTrips = [
        newVehicleTripLine({
          vehicleType: String(d.vehicleType || 'camioGran'),
          kmOutbound: out,
          kmReturn: ret,
          kmTotal: Number(d.kmTotal) || out + ret,
        }),
      ]
    }
  }

  return {
    callTime: String(d.callTime || ''),
    closeTime: String(d.closeTime || ''),
    peopleCount: Number(d.peopleCount) || 0,
    hours: Number(d.hours) || 0,
    hoursManual: Boolean(d.hoursManual),
    vehicleTrips,
    extras: Number(d.extras) || 0,
    extrasNote: String(d.extrasNote || ''),
    managementCost: Number(d.managementCost) || 0,
    preparationCost: Number(d.preparationCost) || 0,
    washingCost: Number(d.washingCost) || 0,
    subtotal: Number(d.subtotal) || 0,
  }
}

export function emptyDepartments(): Record<CostServeisDepartment, DepartmentCostBlock> {
  return {
    logistica: emptyDepartmentBlock(),
    serveis: emptyDepartmentBlock(),
    cuina: emptyDepartmentBlock(),
  }
}

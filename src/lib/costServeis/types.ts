/** Tipus del mòdul Cost de serveis (cost operatiu per event). */

import type { TransportType } from '@/lib/transportTypes'
import type { SpaceKind } from '@/lib/costServeis/spaceOwnership'

export const COST_SERVEIS_DEPARTMENTS = ['logistica', 'serveis', 'cuina'] as const
export type CostServeisDepartment = (typeof COST_SERVEIS_DEPARTMENTS)[number]

export const COST_SERVEIS_DEPT_LABELS: Record<CostServeisDepartment, string> = {
  logistica: 'Logística',
  serveis: 'Serveis',
  cuina: 'Cuina',
}

/** Bases de sortida per al càlcul de km (configurables). */
export type DeparturePoint = {
  label: string
  address: string
  lat?: number | null
  lng?: number | null
}

export type HourlyRateByDept = Record<CostServeisDepartment, number>

export type DepartureByDept = Record<CostServeisDepartment, DeparturePoint>

/** Consum i preu per tipus de vehicle (mateixos tipus que Transports). */
export type VehicleFuelRate = {
  litersPer100km: number
  pricePerLiter: number
}

export type FuelConfig = {
  /** Per defecte anada + tornada */
  roundTripDefault: boolean
  /** Tarifes per tipus de vehicle (`TransportType`) */
  byVehicleType: Partial<Record<TransportType, VehicleFuelRate>> &
    Record<string, VehicleFuelRate>
}

/** Ús d’un vehicle dins d’un bloc de dept. */
export type VehicleTripLine = {
  id: string
  vehicleType: string
  kmOutbound: number
  kmReturn: number
  kmTotal: number
}

/** Bloc de cost d’un departament dins d’un event. */
export type DepartmentCostBlock = {
  /** Convocatòria / inici del quadrant (HH:mm) */
  callTime: string
  /**
   * Fi efectiva (HH:mm): tancament del quadrant si s’ha fet;
   * si no, hora fi de l’esdeveniment.
   */
  closeTime: string
  /**
   * Personal (treballadors totals del dept assignats al quadrant del servei).
   * Ve dels quadrants; persones úniques.
   */
  peopleCount: number
  /** Hores calculades (callTime → closeTime) o sobreescrites */
  hours: number
  hoursManual: boolean
  /** Trajectes per tipus de vehicle */
  vehicleTrips: VehicleTripLine[]
  /** Complements / extres manuals (€) */
  extras: number
  extrasNote: string
  /**
   * Cost de gestió assignat (€).
   * Es calcularà amb dades importades d’OpsiaFinance + fórmules de configuració.
   */
  managementCost: number
  /**
   * Cost de preparació (€) — comú Logística i Cuina.
   * OpsiaFinance + fórmules de configuració (provisional editable).
   */
  preparationCost: number
  /**
   * Cost de rentat (€) — comú Logística i Cuina.
   * OpsiaFinance + fórmules de configuració (provisional editable).
   */
  washingCost: number
  /** Cost calculat del bloc (€) */
  subtotal: number
}

export type ServiceCostSheet = {
  eventId: string
  eventName: string
  eventDate: string
  ln: string
  location: string
  /** Tipus de servei (camp Servei de l’event) */
  serviceType: string
  fincaId?: string | null
  fincaCode?: string | null
  /** Classificació Espais: finca pròpia (`Propi`) o centre extern (`Extern`). */
  spaceKind?: SpaceKind | null
  numPax: number
  /** Facturació (Import) */
  billing: number
  departments: Record<CostServeisDepartment, DepartmentCostBlock>
  /** Cost salarial fix repartit (fase API Opsia; placeholder) */
  fixedSalaryAllocated: number
  operationalTotal: number
  total: number
  pctOfBilling: number | null
  updatedAt?: string
  updatedBy?: string
}

/** Resum d’un bloc de dept per a la llista d’edició (estil Excel). */
export type ServiceCostDeptSummary = {
  peopleCount: number
  /** Durada de la jornada (convocatòria → fi) */
  hours: number
  /** Hores totals = suma d’hores de tots els treballadors (personal × jornada) */
  personHours: number
  extras: number
  kmTotal: number
  /** Cost personal = hores totals × €/h */
  laborCost: number
  fuelCost: number
  /** Cost gestió (OpsiaFinance) */
  managementCost: number
  /** Cost preparació — Logística / Cuina (OpsiaFinance) */
  preparationCost: number
  /** Cost rentat — Logística / Cuina (OpsiaFinance) */
  washingCost: number
  /** Nombre total de vehicles utilitzats (des dels quadrants) */
  vehicleCount: number
  subtotal: number
  /** Vehicles agrupats per tipus (quantitat de línies + km) — legacy / fitxa. */
  vehicles: Array<{ vehicleType: string; lines: number; km: number }>
}

export type ServiceCostListItem = {
  eventId: string
  eventName: string
  eventDate: string
  ln: string
  location: string
  /** Tipus de servei (camp Servei de l’event) */
  serviceType: string
  /** Classificació Espais: finca pròpia (`Propi`) o centre extern (`Extern`). */
  spaceKind: SpaceKind | null
  /** Si el tipus està al catàleg Settings → Serveis (cal per ponderar). */
  serviceInCatalog: boolean
  billing: number
  numPax: number
  hasSheet: boolean
  operationalTotal: number
  total: number
  pctOfBilling: number | null
  /** Subtotals per departament (0 si no hi ha fitxa). */
  byDepartment: Record<CostServeisDepartment, number>
  /** Desglossament operatiu per dept (buit si no hi ha fitxa). */
  detailByDepartment: Record<CostServeisDepartment, ServiceCostDeptSummary>
}

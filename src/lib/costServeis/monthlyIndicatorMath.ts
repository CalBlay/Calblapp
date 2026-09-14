import type { CostServeisDepartment } from '@/lib/costServeis/types'

export const MONTHLY_INDICATOR_VERSION = 2

export const MONTHLY_POT_KEYS = ['gestio', 'preparacio', 'rentat'] as const
export type MonthlyPotKey = (typeof MONTHLY_POT_KEYS)[number]

export type MonthlyActivityStats = {
  eventCount: number
  paxCount: number
  empresaEvents: number
  empresaPax: number
  casamentsEvents: number
  casamentsPax: number
  missingPaxEvents: number
  excludedEvents: number
  averagePax: number | null
  medianPax: number | null
  minPax: number | null
  maxPax: number | null
}

export type MonthlyPotMetrics = {
  grossCost: number
  manualDeductions: number
  netCost: number
  grossCostPerEvent: number | null
  grossCostPerPax: number | null
  netCostPerEvent: number | null
  netCostPerPax: number | null
}

export type MonthlySourceLine = {
  deptCodi: string
  deptNom: string
  costPersonal: number
  pot: MonthlyPotKey | null
}

export type MonthlyCostIndicatorRow = {
  id: string
  ym: string
  year: number
  month: number
  department: CostServeisDepartment
  activity: MonthlyActivityStats
  pots: Record<MonthlyPotKey, MonthlyPotMetrics>
  totals: MonthlyPotMetrics
  sourceLines: MonthlySourceLine[]
  status: 'complete' | 'warning' | 'incomplete'
  warnings: string[]
  opsiaSyncedAt: string
  generatedAt: string
  generatedBy: string
  calculationVersion: number
  runId: string
}

export type MonthlyEventFact = {
  id: string
  runId: string
  ym: string
  eventId: string
  eventDate: string
  eventName: string
  lnRaw: string
  lnNormalized: string
  included: boolean
  exclusionReason: string
  numPax: number
  hasValidPax: boolean
  serviceType: string
  location: string
  spaceKind: 'Propi' | 'Extern' | null
  generatedAt: string
  calculationVersion: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round2(numerator / denominator) : null
}

export function percentileMedian(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? round2((sorted[middle - 1] + sorted[middle]) / 2)
    : round2(sorted[middle])
}

export function buildActivityStats(
  facts: Array<Pick<MonthlyEventFact, 'included' | 'lnNormalized' | 'numPax' | 'hasValidPax'>>
): MonthlyActivityStats {
  const included = facts.filter((fact) => fact.included)
  const validPax = included.filter((fact) => fact.hasValidPax).map((fact) => fact.numPax)
  const empresa = included.filter((fact) => fact.lnNormalized === 'Empresa')
  const casaments = included.filter((fact) => fact.lnNormalized === 'Casaments')
  const sum = (rows: typeof included) => rows.reduce((total, row) => total + row.numPax, 0)

  return {
    eventCount: included.length,
    paxCount: round2(sum(included)),
    empresaEvents: empresa.length,
    empresaPax: round2(sum(empresa)),
    casamentsEvents: casaments.length,
    casamentsPax: round2(sum(casaments)),
    missingPaxEvents: included.length - validPax.length,
    excludedEvents: facts.length - included.length,
    averagePax: validPax.length > 0 ? round2(validPax.reduce((a, b) => a + b, 0) / validPax.length) : null,
    medianPax: percentileMedian(validPax),
    minPax: validPax.length > 0 ? Math.min(...validPax) : null,
    maxPax: validPax.length > 0 ? Math.max(...validPax) : null,
  }
}

export function buildPotMetrics(opts: {
  grossCost: number
  manualDeductions: number
  eventCount: number
  paxCount: number
}): MonthlyPotMetrics {
  const grossCost = round2(Math.max(0, Number(opts.grossCost) || 0))
  const manualDeductions = round2(Math.max(0, Number(opts.manualDeductions) || 0))
  const netCost = round2(Math.max(0, grossCost - manualDeductions))
  return {
    grossCost,
    manualDeductions,
    netCost,
    grossCostPerEvent: ratio(grossCost, opts.eventCount),
    grossCostPerPax: ratio(grossCost, opts.paxCount),
    netCostPerEvent: ratio(netCost, opts.eventCount),
    netCostPerPax: ratio(netCost, opts.paxCount),
  }
}

export function sumPotMetrics(
  pots: Record<MonthlyPotKey, MonthlyPotMetrics>,
  eventCount: number,
  paxCount: number
): MonthlyPotMetrics {
  return buildPotMetrics({
    grossCost: MONTHLY_POT_KEYS.reduce((sum, key) => sum + pots[key].grossCost, 0),
    manualDeductions: MONTHLY_POT_KEYS.reduce(
      (sum, key) => sum + pots[key].manualDeductions,
      0
    ),
    eventCount,
    paxCount,
  })
}

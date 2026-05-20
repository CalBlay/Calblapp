import type {
  ArticleMachineMetrics,
  CuinaCentralMachineArticleRate,
  CuinaCentralProductionLog,
} from './types'
import { isoDurationMinutes, median, parseNumber } from './utils'

export function buildArticleMachineMetrics(
  logs: CuinaCentralProductionLog[],
  rates: CuinaCentralMachineArticleRate[]
): ArticleMachineMetrics[] {
  const rateByPair = new Map<string, CuinaCentralMachineArticleRate>()
  for (const rate of rates) {
    rateByPair.set(`${rate.articleId}::${rate.machineId}`, rate)
  }

  const buckets = new Map<
    string,
    {
      articleId: string
      articleCode: string
      articleName: string
      machineId: string
      machineCode: string
      machineName: string
      unit: string
      minutesPerUnit: number[]
      lastLogAt: string | null
    }
  >()

  for (const log of logs) {
    const qty = parseNumber(log.quantityProduced)
    if (qty <= 0) continue
    const key = `${log.articleId}::${log.machineId}`
    const minutes = log.durationMinutes || isoDurationMinutes(log.startedAt, log.endedAt)
    if (minutes <= 0) continue

    const existing = buckets.get(key) || {
      articleId: log.articleId,
      articleCode: log.articleCode,
      articleName: log.articleName,
      machineId: log.machineId,
      machineCode: log.machineCode,
      machineName: log.machineName,
      unit: log.unit,
      minutesPerUnit: [],
      lastLogAt: null,
    }
    existing.minutesPerUnit.push(minutes / qty)
    if (!existing.lastLogAt || log.endedAt > existing.lastLogAt) {
      existing.lastLogAt = log.endedAt
    }
    buckets.set(key, existing)
  }

  return [...buckets.values()].map((bucket) => {
    const medMin = median(bucket.minutesPerUnit)
    const medianQtyPerHour =
      medMin && medMin > 0 ? Math.round((60 / medMin) * 100) / 100 : null
    const rate = rateByPair.get(`${bucket.articleId}::${bucket.machineId}`)
    const theoreticalQtyPerHour = rate?.qtyPerHour ?? null
    const efficiencyRatio =
      theoreticalQtyPerHour && medianQtyPerHour && theoreticalQtyPerHour > 0
        ? Math.round((medianQtyPerHour / theoreticalQtyPerHour) * 1000) / 1000
        : null

    return {
      articleId: bucket.articleId,
      articleCode: bucket.articleCode,
      articleName: bucket.articleName,
      machineId: bucket.machineId,
      machineCode: bucket.machineCode,
      machineName: bucket.machineName,
      unit: bucket.unit,
      sampleCount: bucket.minutesPerUnit.length,
      medianMinutesPerUnit: medMin ? Math.round(medMin * 100) / 100 : null,
      medianQtyPerHour,
      theoreticalQtyPerHour,
      efficiencyRatio,
      lastLogAt: bucket.lastLogAt,
    }
  })
}

export function estimateMinutesForQuantity(
  metrics: ArticleMachineMetrics[],
  articleId: string,
  machineId: string,
  quantity: number,
  fallbackQtyPerHour?: number | null
): { minutes: number; source: 'learned' | 'theoretical' | 'unknown' } {
  const pair = metrics.find((m) => m.articleId === articleId && m.machineId === machineId)
  if (pair?.medianMinutesPerUnit && quantity > 0) {
    return {
      minutes: Math.ceil(pair.medianMinutesPerUnit * quantity),
      source: 'learned',
    }
  }
  if (fallbackQtyPerHour && fallbackQtyPerHour > 0 && quantity > 0) {
    return {
      minutes: Math.ceil((quantity / fallbackQtyPerHour) * 60),
      source: 'theoretical',
    }
  }
  return { minutes: 0, source: 'unknown' }
}

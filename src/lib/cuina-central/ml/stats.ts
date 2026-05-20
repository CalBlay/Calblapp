import { median } from '../utils'
import type { ModelWindowStats } from './types'

export function computeWindowStats(
  points: { minutesPerUnit: number; qtyPerHour: number; at: number }[],
  sinceMs: number
): ModelWindowStats {
  const filtered = points.filter((p) => p.at >= sinceMs && p.minutesPerUnit > 0)
  const mins = filtered.map((p) => p.minutesPerUnit)
  const qtyH = filtered.map((p) => p.qtyPerHour).filter((v) => v > 0)
  const med = median(mins)
  const meanM =
    mins.length > 0 ? mins.reduce((a, b) => a + b, 0) / mins.length : null
  const meanQ =
    qtyH.length > 0 ? qtyH.reduce((a, b) => a + b, 0) / qtyH.length : null
  const sorted = [...mins].sort((a, b) => a - b)
  const p90 =
    sorted.length > 0
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!
      : null

  return {
    sampleCount: filtered.length,
    meanMinutesPerUnit: meanM != null ? Math.round(meanM * 1000) / 1000 : null,
    medianMinutesPerUnit: med != null ? Math.round(med * 1000) / 1000 : null,
    meanQtyPerHour: meanQ != null ? Math.round(meanQ * 100) / 100 : null,
    p90MinutesPerUnit: p90 != null ? Math.round(p90 * 1000) / 1000 : null,
  }
}

export function confidenceFromSampleCount(n: number): 'low' | 'medium' | 'high' {
  if (n >= 20) return 'high'
  if (n >= 5) return 'medium'
  return 'low'
}

export function ema(previous: number | null, value: number, alpha: number) {
  if (previous == null || !Number.isFinite(previous)) return value
  return alpha * value + (1 - alpha) * previous
}

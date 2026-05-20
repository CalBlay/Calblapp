import { ML_CONFIG } from './constants'
import type { ModelPairState, PredictionResult } from './types'

export function predictFromModelState(
  state: ModelPairState | null | undefined,
  quantity: number
): PredictionResult & { estimatedMinutes: number } {
  const theoretical = state?.theoreticalQtyPerHour ?? null
  const predictedQty = state?.predictedQtyPerHour ?? null
  const predictedMin = state?.predictedMinutesPerUnit ?? null
  const confidence = state?.confidence ?? 'low'
  const efficiencyRatio = state?.efficiencyRatio ?? null

  let source: PredictionResult['source'] = 'unknown'
  let minutesPerUnit: number | null = predictedMin
  let qtyPerHour: number | null = predictedQty

  if (predictedMin && predictedMin > 0 && confidence !== 'low') {
    source = 'ml'
  } else if (theoretical && theoretical > 0 && predictedMin && predictedMin > 0) {
    source = 'blend'
    const theoreticalMin = 60 / theoretical
    const w = Math.min(1, (state?.allTime.sampleCount || 0) / ML_CONFIG.confidenceHighSamples)
    minutesPerUnit = theoreticalMin * (1 - w) + predictedMin * w
    qtyPerHour = minutesPerUnit > 0 ? 60 / minutesPerUnit : theoretical
  } else if (theoretical && theoretical > 0) {
    source = 'theoretical'
    qtyPerHour = theoretical
    minutesPerUnit = 60 / theoretical
  }

  const estimatedMinutes =
    minutesPerUnit && quantity > 0 ? Math.ceil(minutesPerUnit * quantity) : 0

  return {
    minutesPerUnit,
    qtyPerHour,
    confidence,
    source,
    efficiencyRatio,
    estimatedMinutes,
  }
}

/** Tipus del pipeline ML permanent (cuina central). */

export type LearningSample = {
  id: string
  productionLogId: string
  dateKey: string
  articleId: string
  articleCode: string
  machineId: string
  machineCode: string
  shiftId: string
  dayOfWeek: number
  quantityProduced: number
  quantityRejected: number
  durationMinutes: number
  minutesPerUnit: number
  qtyPerHour: number
  operatorCount: number
  unit: string
  createdAt: number
}

export type ModelWindowStats = {
  sampleCount: number
  meanMinutesPerUnit: number | null
  medianMinutesPerUnit: number | null
  meanQtyPerHour: number | null
  p90MinutesPerUnit: number | null
}

export type ModelPairState = {
  id: string
  articleId: string
  articleCode: string
  articleName: string
  machineId: string
  machineCode: string
  machineName: string
  unit: string
  theoreticalQtyPerHour: number | null
  /** Predicció principal (EMA, reacciona ràpid). */
  predictedMinutesPerUnit: number | null
  predictedQtyPerHour: number | null
  efficiencyRatio: number | null
  allTime: ModelWindowStats
  last30d: ModelWindowStats
  last7d: ModelWindowStats
  recentMinutesPerUnit: number[]
  confidence: 'low' | 'medium' | 'high'
  lastSampleAt: string | null
  updatedAt: number
}

export type PredictionResult = {
  minutesPerUnit: number | null
  qtyPerHour: number | null
  confidence: 'low' | 'medium' | 'high'
  source: 'ml' | 'theoretical' | 'blend' | 'unknown'
  efficiencyRatio: number | null
}

export type DailyDeviationRow = {
  articleCode: string
  machineCode: string
  theoreticalQtyPerHour: number | null
  actualQtyPerHour: number | null
  efficiencyRatio: number | null
  deltaPct: number | null
  sampleCount: number
}

export type DailyDecisionReport = {
  id: string
  dateKey: string
  builtAt: number
  logsCount: number
  totalProducedQty: number
  totalRejectedQty: number
  totalMinutes: number
  pairCount: number
  avgEfficiencyRatio: number | null
  deviations: DailyDeviationRow[]
  alerts: string[]
  recommendations: string[]
}

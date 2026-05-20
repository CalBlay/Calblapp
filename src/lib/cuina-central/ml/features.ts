import type { CuinaCentralProductionLog } from '../types'
import { dateKeyFromIso } from './constants'

export type ProductionLogPayload = Omit<
  CuinaCentralProductionLog,
  'id' | 'createdAt' | 'updatedAt'
>

export function extractLearningFeatures(log: ProductionLogPayload) {
  const ended = new Date(log.endedAt)
  const dayOfWeek = Number.isFinite(ended.getTime()) ? ended.getDay() : 0
  const qty = log.quantityProduced
  const minutes = log.durationMinutes
  const minutesPerUnit = qty > 0 && minutes > 0 ? minutes / qty : 0
  const qtyPerHour = minutes > 0 ? (qty / minutes) * 60 : 0
  const operatorCount = log.operatorNames
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean).length

  return {
    dateKey: dateKeyFromIso(log.endedAt),
    dayOfWeek,
    minutesPerUnit,
    qtyPerHour,
    operatorCount: operatorCount || 1,
  }
}

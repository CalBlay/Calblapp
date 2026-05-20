import { buildArticleMachineMetrics, estimateMinutesForQuantity } from './analytics'
import { predictFromModelState } from './ml/predict'
import type { ModelPairState } from './ml/types'
import type {
  CuinaCentralMachine,
  CuinaCentralMachineArticleRate,
  CuinaCentralProductionLog,
  CuinaCentralShift,
  PlanNeedLine,
  PlanSlot,
} from './types'
import { shiftDurationMinutes } from './utils'

export type GeneratePlanInput = {
  weekStart: string
  needs: PlanNeedLine[]
  shifts: CuinaCentralShift[]
  machines: CuinaCentralMachine[]
  rates: CuinaCentralMachineArticleRate[]
  logs: CuinaCentralProductionLog[]
  modelStates: ModelPairState[]
  operatorCountByShift: Record<string, number>
}

const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export function generateWeeklyPlan(input: GeneratePlanInput) {
  const metrics = buildArticleMachineMetrics(input.logs, input.rates)
  const stateByPair = new Map(
    input.modelStates.map((s) => [`${s.articleId}::${s.machineId}`, s])
  )
  const activeMachines = input.machines.filter((m) => m.active !== false)
  const activeShifts = input.shifts.filter((s) => s.active !== false).sort((a, b) => a.sortOrder - b.sortOrder)

  const warnings: string[] = []
  const slots: PlanSlot[] = []

  let totalEstimatedMinutes = 0
  let totalCapacityMinutes = 0
  let overtimeMinutes = 0

  const capacityByDayShift = new Map<string, number>()
  for (const day of WEEK_DAYS) {
    for (const shift of activeShifts) {
      const operators = Math.max(1, Number(input.operatorCountByShift[shift.id] || 1))
      const cap = shift.durationMinutes * operators
      capacityByDayShift.set(`${day}::${shift.id}`, cap)
      totalCapacityMinutes += cap
    }
  }

  const usedByDayShift = new Map<string, number>()

  const pending = [...input.needs]
    .map((need) => {
      let best: {
        machineId: string
        machineCode: string
        machineName: string
        minutes: number
        source: 'ml' | 'learned' | 'theoretical' | 'blend' | 'unknown'
      } | null = null

      for (const machine of activeMachines) {
        const rate = input.rates.find(
          (r) => r.articleId === need.articleId && r.machineId === machine.id
        )
        const state = stateByPair.get(`${need.articleId}::${machine.id}`)
        const ml = predictFromModelState(state, need.quantity)
        let minutes = ml.estimatedMinutes
        let source = ml.source

        if (source === 'unknown') {
          const est = estimateMinutesForQuantity(
            metrics,
            need.articleId,
            machine.id,
            need.quantity,
            rate?.qtyPerHour
          )
          minutes = est.minutes
          source = est.source
        }

        if (source === 'unknown' || minutes <= 0) continue
        if (!best || minutes < best.minutes) {
          best = {
            machineId: machine.id,
            machineCode: machine.code,
            machineName: machine.name,
            minutes,
            source,
          }
        }
      }
      return { need, best }
    })
    .sort((a, b) => (b.best?.minutes || 0) - (a.best?.minutes || 0))

  for (const item of pending) {
    const { need, best } = item
    if (!best) {
      warnings.push(`Sense rendiment per planificar: ${need.articleCode || need.articleName}`)
      continue
    }

    let remainingMinutes = best.minutes
    let remainingQty = need.quantity
    totalEstimatedMinutes += best.minutes

    for (const day of WEEK_DAYS) {
      if (remainingMinutes <= 0) break
      for (const shift of activeShifts) {
        if (remainingMinutes <= 0) break
        const key = `${day}::${shift.id}`
        const cap = capacityByDayShift.get(key) || 0
        const used = usedByDayShift.get(key) || 0
        const free = cap - used
        if (free <= 0) continue

        const assignMinutes = Math.min(free, remainingMinutes)
        const ratio = best.minutes > 0 ? assignMinutes / best.minutes : 1
        const assignQty = Math.round(remainingQty * ratio * 1000) / 1000

        usedByDayShift.set(key, used + assignMinutes)
        remainingMinutes -= assignMinutes
        remainingQty -= assignQty

        slots.push({
          day,
          shiftId: shift.id,
          shiftName: shift.name,
          machineId: best.machineId,
          machineCode: best.machineCode,
          machineName: best.machineName,
          articleId: need.articleId,
          articleCode: need.articleCode,
          articleName: need.articleName,
          quantity: assignQty,
          unit: need.unit,
          estimatedMinutes: assignMinutes,
          operatorCount: Math.max(1, Number(input.operatorCountByShift[shift.id] || 1)),
        })
      }
    }

    if (remainingMinutes > 0) {
      overtimeMinutes += remainingMinutes
      warnings.push(
        `Capacitat insuficient per ${need.articleCode || need.articleName}: falten ~${Math.ceil(remainingMinutes)} min`
      )
    }
  }

  const loadRatio = totalCapacityMinutes > 0 ? totalEstimatedMinutes / totalCapacityMinutes : 0
  if (loadRatio > 1) {
    warnings.push(
      `Càrrega setmanal ${Math.round(loadRatio * 100)}% de la capacitat disponible (objectiu: minimitzar hores extra).`
    )
  }

  return {
    slots,
    warnings,
    totalEstimatedMinutes,
    totalCapacityMinutes,
    overtimeMinutes,
  }
}

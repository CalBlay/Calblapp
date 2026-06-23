import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'
import {
  countCompletedWarehouses,
  isPreparationLineComplete,
  normalizePreparationWarehouseMap,
  preparationLinePct,
} from '@/lib/logistics/preparationMagatzem'
import {
  PREPARATION_WAREHOUSE_CODES,
  PREPARATION_WAREHOUSE_LABELS,
  type PreparationWarehouseCode,
} from '@/lib/logistics/preparationWarehouses'

export type PrepLineStatus = 'unscheduled' | 'not_started' | 'in_progress' | 'complete'

export type PrepLineProgress = {
  row: LogisticsEventPrepRow
  status: PrepLineStatus
  pct: number
  completedWarehouses: PreparationWarehouseCode[]
  warehouseMap: ReturnType<typeof normalizePreparationWarehouseMap>
}

export type WarehouseProgressSummary = {
  warehouse: PreparationWarehouseCode
  label: string
  doneCount: number
  plannedCount: number
  pct: number
}

export function computeLineProgress(row: LogisticsEventPrepRow): PrepLineProgress {
  const warehouseMap = normalizePreparationWarehouseMap(row.PreparacioMagatzems)
  const completedWarehouses = PREPARATION_WAREHOUSE_CODES.filter((warehouse) =>
    Boolean(warehouseMap[warehouse]?.at)
  )

  if (!row.PreparacioData || !row.PreparacioHora) {
    return { row, status: 'unscheduled', pct: 0, completedWarehouses, warehouseMap }
  }

  const pct = preparationLinePct(warehouseMap)
  if (completedWarehouses.length === 0) {
    return { row, status: 'not_started', pct: 0, completedWarehouses, warehouseMap }
  }
  if (isPreparationLineComplete(warehouseMap)) {
    return { row, status: 'complete', pct: 100, completedWarehouses, warehouseMap }
  }
  return { row, status: 'in_progress', pct, completedWarehouses, warehouseMap }
}

export type PreparationProgressSummary = {
  totalCount: number
  plannedCount: number
  completeCount: number
  inProgressCount: number
  notStartedCount: number
  unscheduledCount: number
  averageCompletionPct: number
  warehouseSummaries: WarehouseProgressSummary[]
  lines: PrepLineProgress[]
  plannedLines: PrepLineProgress[]
}

export function computePreparationProgressSummary(
  rows: LogisticsEventPrepRow[]
): PreparationProgressSummary {
  const persistedRows = rows.filter((row) => !row.id.startsWith('draft_'))
  const lines = persistedRows.map((row) => computeLineProgress(row))

  const plannedLines = lines.filter((line) => line.status !== 'unscheduled')
  const completeLines = lines.filter((line) => line.status === 'complete')
  const inProgressLines = lines.filter((line) => line.status === 'in_progress')
  const notStartedLines = lines.filter((line) => line.status === 'not_started')
  const unscheduledLines = lines.filter((line) => line.status === 'unscheduled')

  const averageCompletionPct = plannedLines.length
    ? Math.round(plannedLines.reduce((sum, line) => sum + line.pct, 0) / plannedLines.length)
    : 0

  const plannedCount = plannedLines.length
  const warehouseSummaries: WarehouseProgressSummary[] = PREPARATION_WAREHOUSE_CODES.map(
    (warehouse) => {
      const doneCount = plannedLines.filter((line) =>
        Boolean(line.warehouseMap[warehouse]?.at)
      ).length
      const pct = plannedCount ? Math.round((doneCount / plannedCount) * 100) : 0
      return {
        warehouse,
        label: PREPARATION_WAREHOUSE_LABELS[warehouse],
        doneCount,
        plannedCount,
        pct,
      }
    }
  )

  return {
    totalCount: persistedRows.length,
    plannedCount,
    completeCount: completeLines.length,
    inProgressCount: inProgressLines.length,
    notStartedCount: notStartedLines.length,
    unscheduledCount: unscheduledLines.length,
    averageCompletionPct,
    warehouseSummaries,
    lines,
    plannedLines,
  }
}

export function statusLabel(status: PrepLineStatus, pct: number): string {
  switch (status) {
    case 'complete':
      return 'Completada (100%)'
    case 'in_progress':
      return `En curs (${pct}%)`
    case 'not_started':
      return 'Sense començar'
    case 'unscheduled':
      return 'Sense planificar'
  }
}

export { countCompletedWarehouses, preparationLinePct }

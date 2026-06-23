import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'

export type PrepLineStatus = 'unscheduled' | 'not_started' | 'in_progress' | 'complete'

export type PrepLineProgress = {
  row: LogisticsEventPrepRow
  status: PrepLineStatus
  /** 0–100: fracció de preparadors que han registrat la línia */
  pct: number
  /** Preparadors que han registrat (segons dades disponibles: 0 o 1) */
  registeredCount: number
}

export function computeLineProgress(
  row: LogisticsEventPrepRow,
  preparadorCount: number
): PrepLineProgress {
  if (!row.PreparacioData || !row.PreparacioHora) {
    return { row, status: 'unscheduled', pct: 0, registeredCount: 0 }
  }

  const teamSize = Math.max(1, preparadorCount)
  const registeredCount = row.PreparacioFeta ? 1 : 0

  if (registeredCount === 0) {
    return { row, status: 'not_started', pct: 0, registeredCount: 0 }
  }

  const pct = Math.round((registeredCount / teamSize) * 100)

  if (pct >= 100) {
    return { row, status: 'complete', pct: 100, registeredCount }
  }

  return { row, status: 'in_progress', pct, registeredCount }
}

export type PreparationProgressSummary = {
  preparadorCount: number
  totalCount: number
  plannedCount: number
  completeCount: number
  inProgressCount: number
  notStartedCount: number
  unscheduledCount: number
  /** Mitjana del % de cada línia planificada */
  averageCompletionPct: number
  lines: PrepLineProgress[]
  plannedLines: PrepLineProgress[]
}

export function computePreparationProgressSummary(
  rows: LogisticsEventPrepRow[],
  preparadorCount: number
): PreparationProgressSummary {
  const persistedRows = rows.filter((row) => !row.id.startsWith('draft_'))
  const lines = persistedRows.map((row) => computeLineProgress(row, preparadorCount))

  const plannedLines = lines.filter((line) => line.status !== 'unscheduled')
  const completeLines = lines.filter((line) => line.status === 'complete')
  const inProgressLines = lines.filter((line) => line.status === 'in_progress')
  const notStartedLines = lines.filter((line) => line.status === 'not_started')
  const unscheduledLines = lines.filter((line) => line.status === 'unscheduled')

  const averageCompletionPct = plannedLines.length
    ? Math.round(plannedLines.reduce((sum, line) => sum + line.pct, 0) / plannedLines.length)
    : 0

  return {
    preparadorCount: Math.max(1, preparadorCount),
    totalCount: persistedRows.length,
    plannedCount: plannedLines.length,
    completeCount: completeLines.length,
    inProgressCount: inProgressLines.length,
    notStartedCount: notStartedLines.length,
    unscheduledCount: unscheduledLines.length,
    averageCompletionPct,
    lines,
    plannedLines,
  }
}

export function statusLabel(status: PrepLineStatus, pct: number): string {
  switch (status) {
    case 'complete':
      return 'Completada'
    case 'in_progress':
      return `En curs (${pct}%)`
    case 'not_started':
      return 'Sense començar'
    case 'unscheduled':
      return 'Sense planificar'
  }
}

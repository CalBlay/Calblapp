import { computeLineProgress, computePreparationProgressSummary } from './preparationProgress'
import type { LogisticsEventPrepRow } from './prepTypes'

function row(overrides: Partial<LogisticsEventPrepRow> = {}): LogisticsEventPrepRow {
  return {
    rowType: 'event',
    id: '1',
    EventCode: 'EVT',
    NomEvent: 'Test',
    Ubicacio: 'Finca',
    DataInici: '2026-06-24',
    PreparacioData: '2026-06-23',
    PreparacioHora: '22:00',
    ...overrides,
  }
}

const rows = [
  row({
    id: '1',
    PreparacioMagatzems: {
      BODEGA: { userId: 'u1', userName: 'Xavier', at: '2026-06-23T10:00:00.000Z' },
    },
  }),
  row({
    id: '2',
    PreparacioMagatzems: {
      PARAMENT: { userId: 'u1', userName: 'Xavier', at: '2026-06-23T11:00:00.000Z' },
    },
  }),
  row({ id: '3' }),
  row({ id: '4' }),
  row({ id: '5' }),
  row({ id: '6' }),
]

const summary = computePreparationProgressSummary(rows)

if (summary.completeCount !== 0) throw new Error('expected 0 complete at 100%')
if (summary.inProgressCount !== 2) throw new Error(`expected 2 in progress, got ${summary.inProgressCount}`)
if (summary.notStartedCount !== 4) throw new Error(`expected 4 not started, got ${summary.notStartedCount}`)
if (computeLineProgress(row({ PreparacioMagatzems: { BODEGA: { userId: 'u1', userName: 'X', at: 'x' } } })).pct !== 33) {
  throw new Error('expected 33% per warehouse on a line')
}

console.log('preparationProgress tests passed')

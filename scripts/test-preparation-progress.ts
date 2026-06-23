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

// 6 línies, 15 preparadors, 2 amb un registre cadascuna → 0 al 100%, 2 en curs, 4 a 0%
const rows = [
  row({ id: '1', PreparacioFeta: true, PreparacioFetaPerNom: 'Xavier' }),
  row({ id: '2', PreparacioFeta: true, PreparacioFetaPerNom: 'Xavier' }),
  row({ id: '3' }),
  row({ id: '4' }),
  row({ id: '5' }),
  row({ id: '6' }),
]

const summary = computePreparationProgressSummary(rows, 15)

if (summary.completeCount !== 0) throw new Error('expected 0 complete at 100%')
if (summary.inProgressCount !== 2) throw new Error(`expected 2 in progress, got ${summary.inProgressCount}`)
if (summary.notStartedCount !== 4) throw new Error(`expected 4 not started, got ${summary.notStartedCount}`)
if (computeLineProgress(row({ PreparacioFeta: true }), 15).pct !== 7) {
  throw new Error('expected ~7% per single registrant of 15')
}

console.log('preparationProgress tests passed')

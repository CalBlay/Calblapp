const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizePreparationWarehouseMap,
  countCompletedWarehouses,
  preparationLinePct,
  isPreparationLineComplete,
} = require('../src/lib/logistics/preparationMagatzem')
const {
  computeLineProgress,
  computePreparationProgressSummary,
  computeWorkerPreparationSummary,
  statusLabel,
} = require('../src/lib/logistics/preparationProgress')

function makeRow(overrides = {}) {
  return {
    rowType: 'event',
    id: 'evt-1',
    EventCode: 'E1',
    NomEvent: 'Test event',
    Ubicacio: 'Can Blay',
    DataInici: '2026-07-20',
    PreparacioData: '2026-07-19',
    PreparacioHora: '09:00',
    PreparacioMagatzems: {},
    ...overrides,
  }
}

test('normalizePreparationWarehouseMap keeps only known warehouses with completion timestamps', () => {
  const map = normalizePreparationWarehouseMap({
    BODEGA: { userId: 'u1', userName: 'Ada', at: '2026-07-19T08:00:00.000Z' },
    PARAMENT: { userId: 'u2', userName: 'Bob', at: '  ' },
    MATERIAL: 'done',
    UNKNOWN: { userId: 'u3', userName: 'Cara', at: '2026-07-19T09:00:00.000Z' },
  })

  assert.deepEqual(Object.keys(map), ['BODEGA'])
  assert.equal(map.BODEGA.userId, 'u1')
  assert.equal(map.BODEGA.userName, 'Ada')
  assert.equal(countCompletedWarehouses(map), 1)
  assert.equal(preparationLinePct(map), 33)
  assert.equal(isPreparationLineComplete(map), false)
})

test('normalizePreparationWarehouseMap rejects non-object payloads', () => {
  assert.deepEqual(normalizePreparationWarehouseMap(null), {})
  assert.deepEqual(normalizePreparationWarehouseMap(['BODEGA']), {})
  assert.deepEqual(normalizePreparationWarehouseMap('x'), {})
})

test('computeLineProgress classifies unscheduled, not_started, in_progress, and complete', () => {
  const unscheduled = computeLineProgress(
    makeRow({ PreparacioData: '', PreparacioHora: '', PreparacioMagatzems: {} })
  )
  assert.equal(unscheduled.status, 'unscheduled')
  assert.equal(unscheduled.pct, 0)

  const notStarted = computeLineProgress(makeRow({ PreparacioMagatzems: {} }))
  assert.equal(notStarted.status, 'not_started')
  assert.equal(notStarted.pct, 0)

  const inProgress = computeLineProgress(
    makeRow({
      PreparacioMagatzems: {
        BODEGA: { userId: 'u1', userName: 'Ada', at: '2026-07-19T08:00:00.000Z' },
      },
    })
  )
  assert.equal(inProgress.status, 'in_progress')
  assert.equal(inProgress.pct, 33)
  assert.deepEqual(inProgress.completedWarehouses, ['BODEGA'])

  const complete = computeLineProgress(
    makeRow({
      PreparacioMagatzems: {
        BODEGA: { userId: 'u1', userName: 'Ada', at: 't1' },
        PARAMENT: { userId: 'u2', userName: 'Bob', at: 't2' },
        MATERIAL: { userId: 'u3', userName: 'Cara', at: 't3' },
      },
    })
  )
  assert.equal(complete.status, 'complete')
  assert.equal(complete.pct, 100)
  assert.equal(complete.completedWarehouses.length, 3)
})

test('computePreparationProgressSummary ignores drafts and aggregates warehouse completion', () => {
  const summary = computePreparationProgressSummary([
    makeRow({ id: 'draft_temp', PreparacioMagatzems: {} }),
    makeRow({
      id: 'evt-unscheduled',
      PreparacioData: undefined,
      PreparacioHora: undefined,
    }),
    makeRow({
      id: 'evt-not-started',
      PreparacioMagatzems: {},
    }),
    makeRow({
      id: 'evt-partial',
      PreparacioMagatzems: {
        BODEGA: { userId: 'u1', userName: 'Ada', at: 't1' },
      },
    }),
    makeRow({
      id: 'evt-complete',
      PreparacioMagatzems: {
        BODEGA: { userId: 'u1', userName: 'Ada', at: 't1' },
        PARAMENT: { userId: 'u2', userName: 'Bob', at: 't2' },
        MATERIAL: { userId: 'u3', userName: 'Cara', at: 't3' },
      },
    }),
  ])

  assert.equal(summary.totalCount, 4)
  assert.equal(summary.unscheduledCount, 1)
  assert.equal(summary.notStartedCount, 1)
  assert.equal(summary.inProgressCount, 1)
  assert.equal(summary.completeCount, 1)
  assert.equal(summary.plannedCount, 3)
  // (0 + 33 + 100) / 3 ≈ 44
  assert.equal(summary.averageCompletionPct, 44)

  const bodega = summary.warehouseSummaries.find((row) => row.warehouse === 'BODEGA')
  assert.equal(bodega.plannedCount, 3)
  assert.equal(bodega.doneCount, 2)
  assert.equal(bodega.pct, 67)
})

test('computeWorkerPreparationSummary matches by userId or accent-insensitive name', () => {
  const rows = [
    makeRow({
      id: 'evt-a',
      PreparacioMagatzems: {
        BODEGA: { userId: 'uid-1', userName: 'Sònia Albet', at: 't1' },
        PARAMENT: { userId: 'uid-2', userName: 'Other', at: 't2' },
      },
    }),
    makeRow({
      id: 'evt-b',
      PreparacioMagatzems: {
        MATERIAL: { userId: 'uid-9', userName: 'Sonia Albet', at: 't3' },
      },
    }),
    makeRow({ id: 'evt-c', PreparacioMagatzems: {} }),
  ]

  const byId = computeWorkerPreparationSummary(rows, {
    userId: 'uid-1',
    warehouseCodes: ['BODEGA', 'PARAMENT', 'MATERIAL'],
  })
  assert.equal(byId.totalCount, 3)
  assert.equal(byId.doneCount, 1)
  assert.equal(byId.pendingCount, 2)
  assert.equal(byId.completionPct, 33)

  const byName = computeWorkerPreparationSummary(rows, {
    userName: 'Sonia Albet',
  })
  assert.equal(byName.doneCount, 2)
  assert.equal(byName.completionPct, 67)

  const bodegaOnly = computeWorkerPreparationSummary(rows, {
    userId: 'uid-1',
    warehouseCodes: ['BODEGA'],
  })
  assert.equal(bodegaOnly.warehouses.length, 1)
  assert.equal(bodegaOnly.warehouses[0].doneCount, 1)
})

test('statusLabel returns Catalan progress labels', () => {
  assert.equal(statusLabel('complete', 100), 'Completada (100%)')
  assert.equal(statusLabel('in_progress', 33), 'En curs (33%)')
  assert.equal(statusLabel('not_started', 0), 'Sense començar')
  assert.equal(statusLabel('unscheduled', 0), 'Sense planificar')
})

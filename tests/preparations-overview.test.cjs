const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildPreparationsOverview,
} = require('../src/lib/informes/buildPreparationsOverview')

function snapshot(id, data) {
  return { id, exists: true, data: () => data }
}

function fakeDb(collections) {
  return {
    collection(name) {
      return {
        doc(id) {
          return { id, collectionName: name }
        },
        where() {
          return this
        },
        async get() {
          return { docs: collections[name] || [] }
        },
      }
    },
    async getAll(...refs) {
      return refs.map((ref) =>
        (collections[ref.collectionName] || []).find((doc) => doc.id === ref.id) || {
          id: ref.id,
          exists: false,
          data: () => undefined,
        }
      )
    },
  }
}

test('preparation report uses planned Madrid time and does not duplicate a preparer across warehouses', async () => {
  const db = fakeDb({
    stage_verd: [
      snapshot('event-1', {
        code: 'E-1',
        NomEvent: 'Empresa anual',
        LN: 'Empresa',
        PreparacioData: '2026-01-15',
        PreparacioHora: '10:00',
        PreparacioMagatzems: {
          BODEGA: { userId: 'u1', userName: 'Anna', at: '2026-01-15T10:00:00.000Z' },
          MATERIAL: { userId: 'u1', userName: 'Anna', at: '2026-01-15T11:00:00.000Z' },
          PARAMENT: { userId: 'u2', userName: 'Natasha', at: '2026-01-15T10:30:00.000Z' },
        },
      }),
      snapshot('event-2', {
        code: 'E-2',
        NomEvent: 'Casament',
        LN: 'Casaments',
        PreparacioData: '2026-01-16',
        PreparacioHora: '10:00',
        PreparacioMagatzems: {
          BODEGA: { userId: 'u1', userName: 'Anna', at: '2026-01-16T10:00:00.000Z' },
        },
      }),
    ],
    logistics_preparation_services: [],
    users: [
      snapshot('u1', { authId: 'u1', name: 'Anna', department: 'Logistica' }),
      snapshot('u2', { authId: 'u2', name: 'Natasha', department: 'Decoracio' }),
    ],
  })

  const report = await buildPreparationsOverview({
    db,
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
  })

  assert.equal(report.details.length, 3)
  assert.equal(report.kpis.preparationCount, 3)
  assert.equal(report.kpis.totalHours, 4.5)
  const anna = report.details.find((row) => row.preparerName === 'Anna' && row.eventCode === 'E-1')
  assert.equal(anna.durationMinutes, 120)
  assert.deepEqual(anna.warehouseLabels, ['Bodega', 'Material'])
  assert.equal(anna.businessLine, 'Empresa')
  assert.deepEqual(
    report.byBusinessLine.map((row) => [row.businessLine, row.sharePct]),
    [['Empresa', 77.78], ['Casaments', 22.22]]
  )

  const logisticsReport = await buildPreparationsOverview({
    db,
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    department: 'Logística',
  })
  assert.deepEqual(
    logisticsReport.details.map((row) => row.preparerName),
    ['Anna', 'Anna']
  )
  assert.deepEqual(logisticsReport.filterOptions.departments, ['Decoracions', 'Logística'])

  const decorationsReport = await buildPreparationsOverview({
    db,
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    department: 'Decoracions',
  })
  assert.deepEqual(decorationsReport.details.map((row) => row.preparerName), ['Natasha'])
})

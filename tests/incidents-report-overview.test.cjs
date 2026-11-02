const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildIncidentsOverview } = require('../src/lib/informes/incidentsOverview')

const at = (day) => new Date(`${day}T12:00:00`).getTime()
const incident = (overrides = {}) => ({
  id: 'i-1', incidentNumber: 'INC000001', createdAt: at('2026-10-10'), eventDate: '2026-10-10',
  eventCode: 'E-1', eventTitle: 'Prova', eventLocation: 'Masia', department: 'Serveis',
  importance: 'normal', status: 'obert', categoryId: '100', categoryLabel: 'Servei',
  createdBy: 'Anna', description: 'Prova', resolvedAt: 0, ...overrides,
})

test('incident reports aggregate current and previous periods', () => {
  const result = buildIncidentsOverview({
    incidents: [incident(), incident({ id: 'i-2', status: 'resolt', importance: 'urgent', resolvedAt: at('2026-10-11') }), incident({ id: 'old', createdAt: at('2026-09-10') })],
    dateFrom: '2026-10-01', dateTo: '2026-10-31', previousDateFrom: '2026-09-01', previousDateTo: '2026-09-30',
    scope: { allDepartments: true, department: '' },
  })
  assert.equal(result.kpis.total, 2)
  assert.equal(result.kpis.resolved, 1)
  assert.equal(result.kpis.highPriority, 1)
  assert.equal(result.kpis.resolutionPct, 50)
  assert.equal(result.previousKpis.total, 1)
})

test('department scope cannot be widened by a requested filter', () => {
  const result = buildIncidentsOverview({
    incidents: [incident(), incident({ id: 'i-2', department: 'Cuina' })],
    dateFrom: '2026-10-01', dateTo: '2026-10-31', previousDateFrom: '2026-09-01', previousDateTo: '2026-09-30',
    scope: { allDepartments: false, department: 'Sérveis' },
    filters: { department: 'Cuina' },
  })
  assert.equal(result.kpis.total, 0)
  assert.deepEqual(result.filterOptions.departments, ['Serveis'])
})

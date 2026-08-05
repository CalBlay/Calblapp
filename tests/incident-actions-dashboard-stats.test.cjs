const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildIncidentActionsDashboardStats,
} = require('../src/lib/incidentActionsDashboardStats')

const NOW = new Date('2026-08-05T12:00:00.000Z')

function action(partial) {
  return {
    id: 'a1',
    incidentId: 'inc-1',
    title: 'Follow up',
    description: '',
    status: 'open',
    assignedToName: 'Anna',
    department: 'Producció',
    dueAt: '2026-08-04',
    createdAt: '2026-08-01',
    ...partial,
  }
}

test('buildIncidentActionsDashboardStats counts overdue open/in_progress against injectable now', () => {
  const stats = buildIncidentActionsDashboardStats(
    [
      action({ id: 'overdue-open', dueAt: '2026-08-04', status: 'open' }),
      action({ id: 'overdue-progress', dueAt: '2026-08-03', status: 'in_progress' }),
      action({ id: 'due-today', dueAt: '2026-08-05', status: 'open' }),
      action({ id: 'done-past', dueAt: '2026-08-01', status: 'done' }),
      action({ id: 'no-due', dueAt: '', status: 'open' }),
    ],
    [{ id: 'inc-1', incidentNumber: 'INC-9', eventTitle: 'Festa / Extra', eventCode: 'CEU' }],
    { now: NOW }
  )

  assert.equal(stats.total, 5)
  assert.equal(stats.overdue, 2)
  assert.equal(stats.byStatus.open, 3)
  assert.equal(stats.byStatus.in_progress, 1)
  assert.equal(stats.byStatus.done, 1)

  const overdueRows = stats.tableRows.filter((row) => row.isOverdue)
  assert.deepEqual(
    overdueRows.map((row) => row.actionId).sort(),
    ['overdue-open', 'overdue-progress']
  )
  assert.equal(stats.tableRows[0].incidentLabel.includes('INC-9'), true)
  assert.equal(stats.tableRows[0].incidentLabel.includes('CEU'), true)
  assert.equal(stats.tableRows[0].incidentLabel.includes('Festa'), true)
})

test('buildIncidentActionsDashboardStats truncates long event titles and sorts dept chart', () => {
  const longTitle = 'A'.repeat(60)
  const stats = buildIncidentActionsDashboardStats(
    [
      action({ id: '1', department: 'Cuina', status: 'open', dueAt: '2026-08-10' }),
      action({ id: '2', department: 'Cuina', status: 'open', dueAt: '2026-08-10' }),
      action({ id: '3', department: '', status: 'cancelled', dueAt: '2026-08-01' }),
    ],
    [{ id: 'inc-1', eventTitle: longTitle }],
    { now: NOW }
  )

  assert.equal(stats.tableRows[0].incidentLabel.endsWith('…'), true)
  assert.equal(stats.tableRows[0].incidentLabel.length <= 49, true)
  assert.deepEqual(
    stats.deptChart.map((entry) => entry.name),
    ['Cuina', 'Sense departament']
  )
  assert.equal(stats.overdue, 0)
})

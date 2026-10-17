const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  filterMineIncidentActions,
  isOverdueIncidentAction,
} = require('../src/lib/incidentActionsMine')

function row(partial = {}) {
  return {
    id: 'action-1',
    incidentId: 'inc-1',
    title: 'Revisar carta',
    description: '',
    status: 'open',
    assignedToName: 'Anna',
    department: 'Food Lover',
    dueAt: '2099-01-01',
    createdAt: '',
    closedAt: '',
    incident: {
      incidentNumber: 'INC-9',
      eventTitle: 'Casament / extra',
      eventCode: 'EV-1',
      eventDate: '2026-09-04',
      department: 'serveis',
    },
    ...partial,
  }
}

test('mine-action filter defaults to pending and searches incident identity fields', () => {
  const open = row()
  const done = row({ id: 'action-2', status: 'done', title: 'Tancar acta' })
  const other = row({
    id: 'action-3',
    title: 'Comprar vi',
    incident: {
      incidentNumber: 'INC-2',
      eventTitle: 'Concert',
      eventCode: 'EV-9',
      eventDate: '2026-09-05',
      department: 'logistica',
    },
  })

  assert.deepEqual(
    filterMineIncidentActions([open, done, other], {}).map((item) => item.id),
    ['action-1', 'action-3']
  )
  assert.deepEqual(
    filterMineIncidentActions([open, done], { status: 'all' }).map((item) => item.id),
    ['action-1', 'action-2']
  )
  assert.deepEqual(
    filterMineIncidentActions([open, other], { q: 'ev-1' }).map((item) => item.id),
    ['action-1']
  )
  assert.deepEqual(
    filterMineIncidentActions([open, other], { q: 'casament' }).map((item) => item.id),
    ['action-1']
  )
})

test('overdue mine actions require a pending status and a due date before today', () => {
  const overdueOpen = row({ id: 'overdue', dueAt: '2020-01-01T23:59:59Z' })
  const futureOpen = row({ id: 'future', dueAt: '2099-12-31' })
  const overdueDone = row({ id: 'done', status: 'fet', dueAt: '2020-01-01' })
  const missingDue = row({ id: 'nodue', dueAt: '' })

  assert.equal(isOverdueIncidentAction(overdueOpen), true)
  assert.equal(isOverdueIncidentAction(futureOpen), false)
  assert.equal(isOverdueIncidentAction(overdueDone), false)
  assert.equal(isOverdueIncidentAction(missingDue), false)

  assert.deepEqual(
    filterMineIncidentActions([overdueOpen, futureOpen, overdueDone, missingDue], {
      overdueOnly: true,
    }).map((item) => item.id),
    ['overdue']
  )
})

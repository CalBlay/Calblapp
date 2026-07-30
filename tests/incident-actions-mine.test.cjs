const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  isPendingIncidentActionStatus,
  isOverdueIncidentAction,
  buildIncidentActionMineLabel,
  filterMineIncidentActions,
} = require('../src/lib/incidentActionsMine')

function row(partial) {
  return {
    id: 'a1',
    incidentId: 'inc-12345678',
    title: 'Revisar acta',
    description: '',
    status: 'open',
    assignedToName: 'Anna',
    department: 'produccio',
    dueAt: '2026-07-20',
    createdAt: '2026-07-01',
    closedAt: '',
    incident: {
      incidentNumber: 'INC-9',
      eventTitle: 'Casament / extras',
      eventCode: 'EV01',
      eventDate: '2026-07-15',
      department: 'serveis',
    },
    ...partial,
  }
}

test('isPendingIncidentActionStatus only treats open/in_progress as pending', () => {
  assert.equal(isPendingIncidentActionStatus('open'), true)
  assert.equal(isPendingIncidentActionStatus('in_progress'), true)
  assert.equal(isPendingIncidentActionStatus('done'), false)
  assert.equal(isPendingIncidentActionStatus('cancelled'), false)
})

test('isOverdueIncidentAction uses injected now and ignores closed/invalid dues', () => {
  const now = new Date('2026-07-30T12:00:00')
  assert.equal(isOverdueIncidentAction(row({ dueAt: '2026-07-20' }), now), true)
  assert.equal(isOverdueIncidentAction(row({ dueAt: '2026-07-30' }), now), false)
  assert.equal(isOverdueIncidentAction(row({ dueAt: '2026-08-01' }), now), false)
  assert.equal(isOverdueIncidentAction(row({ status: 'done', dueAt: '2026-07-01' }), now), false)
  assert.equal(isOverdueIncidentAction(row({ dueAt: '' }), now), false)
  assert.equal(isOverdueIncidentAction(row({ dueAt: 'not-a-date' }), now), false)
})

test('buildIncidentActionMineLabel prefers number/code/title and truncates long titles', () => {
  assert.equal(
    buildIncidentActionMineLabel(row()),
    'INC-9 · EV01 · Casament'
  )
  assert.equal(
    buildIncidentActionMineLabel(
      row({
        incidentId: 'abcdef012345',
        incident: {
          incidentNumber: null,
          eventTitle: null,
          eventCode: null,
          eventDate: null,
          department: null,
        },
      })
    ),
    'abcdef01'
  )
})

test('filterMineIncidentActions supports pending/overdue/search filters deterministically', () => {
  const now = new Date('2026-07-30T08:00:00')
  const rows = [
    row({ id: 'open-overdue', title: 'Acta pendent', dueAt: '2026-07-10' }),
    row({ id: 'open-future', title: 'Seguiment', dueAt: '2026-08-05' }),
    row({ id: 'done-old', status: 'done', title: 'Tancada', dueAt: '2026-07-01' }),
    row({
      id: 'in-progress-match',
      status: 'in_progress',
      title: 'Revisió cuina',
      dueAt: '2026-07-15',
      incident: {
        incidentNumber: 'INC-77',
        eventTitle: 'Festa',
        eventCode: 'FX',
        eventDate: '2026-07-12',
        department: 'cuina',
      },
    }),
  ]

  const pending = filterMineIncidentActions(rows, { status: 'pending', now })
  assert.deepEqual(
    pending.map((r) => r.id).sort(),
    ['in-progress-match', 'open-future', 'open-overdue']
  )

  const overdue = filterMineIncidentActions(rows, {
    status: 'pending',
    overdueOnly: true,
    now,
  })
  assert.deepEqual(
    overdue.map((r) => r.id).sort(),
    ['in-progress-match', 'open-overdue']
  )

  const search = filterMineIncidentActions(rows, {
    status: 'all',
    q: 'inc-77',
    now,
  })
  assert.deepEqual(
    search.map((r) => r.id),
    ['in-progress-match']
  )
})

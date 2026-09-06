const assert = require('node:assert/strict')
const { test } = require('node:test')

const { getIncidentEventGroupMeta } = require('../src/lib/incidentEventGroupMeta')

function incident(overrides = {}) {
  return {
    id: 'inc-1',
    status: 'obert',
    ...overrides,
  }
}

test('an empty event group is not treated as fully resolved', () => {
  assert.deepEqual(getIncidentEventGroupMeta([]), {
    openCount: 0,
    urgentCount: 0,
    allResolved: false,
  })
})

test('open and in-progress incidents count as open; unknown status defaults to open', () => {
  const meta = getIncidentEventGroupMeta([
    incident({ status: 'Obert' }),
    incident({ status: 'en_curs' }),
    incident({ status: 'mystery' }),
    incident({ status: 'Resolt' }),
  ])
  assert.equal(meta.openCount, 3)
  assert.equal(meta.urgentCount, 0)
  assert.equal(meta.allResolved, false)
})

test('urgent and alta both raise the urgent count even when the ticket is closed', () => {
  const meta = getIncidentEventGroupMeta([
    incident({ status: 'resolt', importance: 'Urgent' }),
    incident({ status: 'tancat', priority: 'alta' }),
    // importance wins over a leftover priority when both are present
    incident({ status: 'obert', importance: 'baixa', priority: 'alta' }),
  ])
  assert.equal(meta.urgentCount, 2)
  assert.equal(meta.openCount, 1)
  assert.equal(meta.allResolved, false)
})

test('a group is fully resolved only when every row is resolt or tancat', () => {
  assert.equal(
    getIncidentEventGroupMeta([
      incident({ status: 'resolt' }),
      incident({ status: 'Tancada' }),
    ]).allResolved,
    true
  )
  assert.equal(
    getIncidentEventGroupMeta([
      incident({ status: 'resolt' }),
      incident({ status: 'en_curs' }),
    ]).allResolved,
    false
  )
})

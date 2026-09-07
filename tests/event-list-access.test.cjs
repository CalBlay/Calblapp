const assert = require('node:assert/strict')
const { test } = require('node:test')

const { shouldRestrictEventsListToOwnAssignments } = require('../src/lib/eventListAccess')

test('workers without events edit only see their assigned events', () => {
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: 'treballador',
      isProductionOperationalWorker: false,
      hasFullEventsAccess: false,
    }),
    true
  )
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: 'Treballador',
      isProductionOperationalWorker: false,
      hasFullEventsAccess: false,
    }),
    true
  )
})

test('production workers and events editors see the full events list', () => {
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: 'treballador',
      isProductionOperationalWorker: true,
      hasFullEventsAccess: false,
    }),
    false
  )
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: 'treballador',
      isProductionOperationalWorker: false,
      hasFullEventsAccess: true,
    }),
    false
  )
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: 'cap',
      isProductionOperationalWorker: false,
      hasFullEventsAccess: false,
    }),
    false
  )
  assert.equal(
    shouldRestrictEventsListToOwnAssignments({
      role: '',
      isProductionOperationalWorker: false,
      hasFullEventsAccess: false,
    }),
    false
  )
})

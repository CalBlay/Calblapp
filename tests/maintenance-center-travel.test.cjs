const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeMaintenanceLocationKey,
  splitTravelMinutes,
  combineTravelParts,
  buildMaintenanceTravelIndex,
  resolveMaintenanceTravelMinutesOneWay,
  resolveMaintenanceTravelMinutesRoundTrip,
  addMaintenanceTravelToWorkMinutes,
} = require('../src/lib/maintenanceCenterTravel')

test('normalizeMaintenanceLocationKey folds accents and collapses whitespace', () => {
  assert.equal(normalizeMaintenanceLocationKey('  Can Bláy  '), 'can blay')
  assert.equal(normalizeMaintenanceLocationKey('Finca\tNord'), 'finca nord')
  assert.equal(normalizeMaintenanceLocationKey(null), '')
})

test('splitTravelMinutes and combineTravelParts round-trip safely', () => {
  assert.deepEqual(splitTravelMinutes(125), { hours: 2, minutes: 5, total: 125 })
  assert.deepEqual(splitTravelMinutes(-10), { hours: 0, minutes: 0, total: 0 })
  assert.equal(combineTravelParts(2, 5), 125)
  assert.equal(combineTravelParts(100, 90), 99 * 60 + 59)
  assert.equal(combineTravelParts(-1, -5), 0)
})

test('buildMaintenanceTravelIndex indexes by name and code', () => {
  const index = buildMaintenanceTravelIndex([
    { name: 'Can Blay', code: 'CB', travelMinutes: 40 },
    { name: 'Finca Nord', code: 'FN', travelMinutes: 15 },
  ])
  assert.equal(index.get('can blay'), 40)
  assert.equal(index.get('cb'), 40)
  assert.equal(index.get('finca nord'), 15)
  assert.equal(index.get('fn'), 15)
})

test('resolveMaintenanceTravelMinutesOneWay prefers exact then longest substring match', () => {
  const index = buildMaintenanceTravelIndex([
    { name: 'Can Blay', code: 'CB', travelMinutes: 40 },
    { name: 'Can Blay Restaurant', code: 'CBR', travelMinutes: 55 },
    { name: 'Finca Nord', code: 'FN', travelMinutes: 15 },
  ])

  assert.equal(resolveMaintenanceTravelMinutesOneWay('Can Blay', index), 40)
  assert.equal(resolveMaintenanceTravelMinutesOneWay('cb', index), 40)
  // Longer overlapping candidate wins over shorter "can blay"
  assert.equal(
    resolveMaintenanceTravelMinutesOneWay('Can Blay Restaurant sala 2', index),
    55
  )
  assert.equal(resolveMaintenanceTravelMinutesOneWay('unknown site', index), 0)
  assert.equal(resolveMaintenanceTravelMinutesOneWay('', index), 0)
})

test('round-trip and work+travel totals default to anada+tornada', () => {
  const index = buildMaintenanceTravelIndex([
    { name: 'Can Blay', code: 'CB', travelMinutes: 40 },
  ])

  assert.equal(resolveMaintenanceTravelMinutesRoundTrip('Can Blay', index), 80)

  assert.deepEqual(
    addMaintenanceTravelToWorkMinutes(90, 'Can Blay', index),
    { workMinutes: 90, travelMinutes: 80, totalMinutes: 170 }
  )
  assert.deepEqual(
    addMaintenanceTravelToWorkMinutes(90, 'Can Blay', index, { roundTrip: false }),
    { workMinutes: 90, travelMinutes: 40, totalMinutes: 130 }
  )
  assert.deepEqual(
    addMaintenanceTravelToWorkMinutes(-5, 'Can Blay', index),
    { workMinutes: 0, travelMinutes: 80, totalMinutes: 80 }
  )
})

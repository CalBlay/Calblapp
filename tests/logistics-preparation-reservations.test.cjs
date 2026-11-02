const test = require('node:test')
const assert = require('node:assert/strict')

const {
  preparationAvailableQuantity,
  preparationIntervalsOverlap,
} = require('../src/lib/logistics/preparationReservations.ts')

test('preparation machinery is reusable when one event ends exactly as another starts', () => {
  assert.equal(
    preparationIntervalsOverlap(
      { startKey: '2026-10-30T10:00', endKey: '2026-10-30T12:00' },
      { startKey: '2026-10-30T12:00', endKey: '2026-10-30T14:00' }
    ),
    false
  )
})

test('preparation machinery is unavailable for partially overlapping events', () => {
  assert.equal(
    preparationIntervalsOverlap(
      { startKey: '2026-10-30T10:00', endKey: '2026-10-30T12:30' },
      { startKey: '2026-10-30T12:00', endKey: '2026-10-30T14:00' }
    ),
    true
  )
})

test('preparation availability subtracts reservations and never becomes negative', () => {
  assert.equal(preparationAvailableQuantity(5, 2), 3)
  assert.equal(preparationAvailableQuantity(2, 5), 0)
})

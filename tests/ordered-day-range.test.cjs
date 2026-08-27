const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  orderedDayRangeFromISOStrings,
  orderedDayRangeFromLocalDates,
} = require('../src/lib/firestoreQuadrantsRangeQuery')

test('orderedDayRangeFromISOStrings orders inverted ranges and rejects bad days', () => {
  assert.deepEqual(orderedDayRangeFromISOStrings('2026-08-01', '2026-08-10'), {
    start: '2026-08-01',
    end: '2026-08-10',
  })
  assert.deepEqual(orderedDayRangeFromISOStrings('2026-08-10T12:00:00Z', '2026-08-01T00:00:00Z'), {
    start: '2026-08-01',
    end: '2026-08-10',
  })
  assert.equal(orderedDayRangeFromISOStrings('2026-08-01', 'not-a-date'), null)
  assert.equal(orderedDayRangeFromISOStrings('', '2026-08-01'), null)
  assert.equal(orderedDayRangeFromISOStrings('08/01/2026', '2026-08-10'), null)
})

test('orderedDayRangeFromLocalDates uses local YMD and swaps inverted inputs', () => {
  const a = new Date(2026, 7, 10)
  const b = new Date(2026, 7, 1)
  assert.deepEqual(orderedDayRangeFromLocalDates(a, b), {
    start: '2026-08-01',
    end: '2026-08-10',
  })
  assert.deepEqual(orderedDayRangeFromLocalDates(b, a), {
    start: '2026-08-01',
    end: '2026-08-10',
  })
})

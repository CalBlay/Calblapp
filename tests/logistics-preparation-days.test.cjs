const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildPreparationDayId,
  listEventDays,
} = require('../src/lib/logistics/preparationDays')

test('listEventDays expands a multi-day event inclusively', () => {
  assert.deepEqual(listEventDays('2026-11-04', '2026-11-06'), [
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
  ])
})

test('listEventDays keeps a one-day event as one day', () => {
  assert.deepEqual(listEventDays('2026-11-04', '2026-11-04'), ['2026-11-04'])
})

test('buildPreparationDayId is stable and Firestore-safe', () => {
  assert.equal(
    buildPreparationDayId('event/legacy', '2026-11-05'),
    'prepday_event_legacy_2026-11-05'
  )
})

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildManualRecurrenceDates,
} = require('../src/lib/costServeis/manualRecurrence')
const { normalizeManualLnName } = require('../src/lib/costServeis/manualLnOptions')

test('Ametller aliases use the selectable ATMETLLER line', () => {
  assert.equal(normalizeManualLnName('Ametller'), 'ATMETLLER')
  assert.equal(normalizeManualLnName('ATMETLLER'), 'ATMETLLER')
})

test('monthly weekly recurrence creates Tuesdays and Thursdays only', () => {
  assert.deepEqual(
    buildManualRecurrenceDates('2026-09-01', {
      kind: 'weekly',
      endDate: '2026-09-30',
      weekdays: [2, 4],
    }),
    [
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
      '2026-09-15',
      '2026-09-17',
      '2026-09-22',
      '2026-09-24',
      '2026-09-29',
    ]
  )
})

test('monthly interval recurrence includes the first day and repeats every two days', () => {
  const dates = buildManualRecurrenceDates('2026-09-01', {
    kind: 'interval',
    endDate: '2026-09-30',
    intervalDays: 2,
  })
  assert.equal(dates.length, 15)
  assert.equal(dates[0], '2026-09-01')
  assert.equal(dates.at(-1), '2026-09-29')
})

test('recurrence rejects an empty weekday selection and an inverted period', () => {
  assert.throws(
    () =>
      buildManualRecurrenceDates('2026-09-01', {
        kind: 'weekly',
        endDate: '2026-09-30',
        weekdays: [],
      }),
    /almenys un dia/
  )
  assert.throws(
    () =>
      buildManualRecurrenceDates('2026-09-30', {
        kind: 'interval',
        endDate: '2026-09-01',
        intervalDays: 2,
      }),
    /posterior/
  )
})

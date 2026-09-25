const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  calendarPeriodForYear,
} = require('../src/lib/calendar/calendarYearNavigation')

test('calendar year jump keeps the active month', () => {
  assert.deepEqual(
    calendarPeriodForYear({
      start: '2026-09-01',
      mode: 'month',
      year: 2028,
      rangeMonths: 6,
    }),
    { start: '2028-09-01', end: '2028-09-30' }
  )
})

test('calendar year jump recalculates the equivalent Monday-Sunday week', () => {
  assert.deepEqual(
    calendarPeriodForYear({
      start: '2026-09-21',
      mode: 'week',
      year: 2028,
      rangeMonths: 6,
    }),
    { start: '2028-09-18', end: '2028-09-24' }
  )
})

test('calendar year jump keeps the selected range length', () => {
  assert.deepEqual(
    calendarPeriodForYear({
      start: '2026-09-01',
      mode: 'range',
      year: 2028,
      rangeMonths: 12,
    }),
    { start: '2028-09-01', end: '2029-08-31' }
  )
})

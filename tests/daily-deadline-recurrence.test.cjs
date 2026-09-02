const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildDailyDeadlineRecurrence,
  deadlineCalendarRecurrenceBody,
  deadlineCalendarStartDate,
} = require('../src/lib/projects/dailyDeadlineRecurrence')

const TODAY = '2026-08-25'

test('future deadline builds a daily series from today through the due date', () => {
  const recurrence = buildDailyDeadlineRecurrence('2026-09-30', TODAY)
  assert.deepEqual(recurrence, {
    pattern: { type: 'daily', interval: 1 },
    range: {
      type: 'endDate',
      startDate: TODAY,
      endDate: '2026-09-30',
      recurrenceTimeZone: 'Europe/Madrid',
    },
  })
  assert.equal(deadlineCalendarStartDate('2026-09-30', TODAY), TODAY)
})

test('today or past deadline is a single instance, not a series', () => {
  assert.equal(buildDailyDeadlineRecurrence(TODAY, TODAY), null)
  assert.equal(buildDailyDeadlineRecurrence('2026-08-20', TODAY), null)
  assert.equal(buildDailyDeadlineRecurrence('', TODAY), null)
  assert.equal(deadlineCalendarStartDate(TODAY, TODAY), TODAY)
  assert.equal(deadlineCalendarStartDate('2026-08-20', TODAY), '2026-08-20')
})

test('create of a today/past deadline omits recurrence (single new event)', () => {
  assert.deepEqual(deadlineCalendarRecurrenceBody(TODAY, { todayKey: TODAY }), {})
  assert.deepEqual(deadlineCalendarRecurrenceBody('2026-08-20', { todayKey: TODAY, eventId: '' }), {})
})

test('PATCH of an existing series must send recurrence:null when the new deadline is today/past', () => {
  const body = deadlineCalendarRecurrenceBody('2026-08-20', {
    todayKey: TODAY,
    eventId: 'AAMkAG-series-master',
  })
  assert.deepEqual(body, { recurrence: null })
  const serialized = JSON.stringify({
    isAllDay: true,
    ...body,
  })
  assert.match(serialized, /"recurrence":null/)
})

test('PATCH of a still-future deadline still sends the updated series range', () => {
  const body = deadlineCalendarRecurrenceBody('2026-09-15', {
    todayKey: TODAY,
    eventId: 'AAMkAG-series-master',
  })
  assert.equal(body.recurrence?.range.endDate, '2026-09-15')
})

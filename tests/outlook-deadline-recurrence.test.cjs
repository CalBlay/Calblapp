const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  dateKeyInMadrid,
  buildDailyDeadlineRecurrence,
} = require('../src/lib/outlookDeadlineRecurrence')

test('dateKeyInMadrid uses Europe/Madrid, not UTC', () => {
  // 20 Aug 2026 22:30 UTC is already 21 Aug 00:30 in Madrid (CEST, UTC+2).
  const lateUtc = new Date('2026-08-20T22:30:00.000Z')
  assert.equal(dateKeyInMadrid(lateUtc), '2026-08-21')
  assert.equal(dateKeyInMadrid(new Date('2026-08-20T21:30:00.000Z')), '2026-08-20')
})

test('buildDailyDeadlineRecurrence skips empty, past, and same-day deadlines', () => {
  const now = new Date('2026-08-20T10:00:00.000Z')
  assert.equal(buildDailyDeadlineRecurrence('', now), null)
  assert.equal(buildDailyDeadlineRecurrence('2026-08-19', now), null)
  assert.equal(buildDailyDeadlineRecurrence('2026-08-20', now), null)
})

test('buildDailyDeadlineRecurrence repeats daily from today through a future deadline', () => {
  const now = new Date('2026-08-20T10:00:00.000Z')
  assert.deepEqual(buildDailyDeadlineRecurrence('2026-08-25', now), {
    pattern: { type: 'daily', interval: 1 },
    range: {
      type: 'endDate',
      startDate: '2026-08-20',
      endDate: '2026-08-25',
      recurrenceTimeZone: 'Europe/Madrid',
    },
  })
})

test('buildDailyDeadlineRecurrence starts on the Madrid calendar day', () => {
  const madridNextDay = new Date('2026-08-20T22:30:00.000Z')
  assert.equal(buildDailyDeadlineRecurrence('2026-08-21', madridNextDay), null)
  assert.deepEqual(buildDailyDeadlineRecurrence('2026-08-22', madridNextDay), {
    pattern: { type: 'daily', interval: 1 },
    range: {
      type: 'endDate',
      startDate: '2026-08-21',
      endDate: '2026-08-22',
      recurrenceTimeZone: 'Europe/Madrid',
    },
  })
})

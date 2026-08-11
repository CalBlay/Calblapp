const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  evaluateRangeEligibility,
  isEligibleByName,
} = require('../src/services/eligibility')

const d = (iso) => new Date(iso)

test('evaluateRangeEligibility rejects overlapping ranges', () => {
  const result = evaluateRangeEligibility({
    reqStart: d('2026-08-11T10:00:00'),
    reqEnd: d('2026-08-11T14:00:00'),
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-11T12:00:00'),
    busyEnd: d('2026-08-11T16:00:00'),
    busyStartDate: '2026-08-11',
    ctx: { restHours: 8, allowMultipleEventsSameDay: true },
  })
  assert.deepEqual(result, { eligible: false, reason: 'overlap' })
})

test('evaluateRangeEligibility rejects same-day when multiples are disabled', () => {
  const result = evaluateRangeEligibility({
    reqStart: d('2026-08-11T18:00:00'),
    reqEnd: d('2026-08-11T22:00:00'),
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-11T08:00:00'),
    busyEnd: d('2026-08-11T12:00:00'),
    busyStartDate: '2026-08-11',
    ctx: { restHours: 1, allowMultipleEventsSameDay: false },
  })
  assert.deepEqual(result, { eligible: false, reason: 'same_day_not_allowed' })
})

test('evaluateRangeEligibility enforces rest gap between non-overlapping services', () => {
  const result = evaluateRangeEligibility({
    reqStart: d('2026-08-11T14:00:00'),
    reqEnd: d('2026-08-11T18:00:00'),
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-11T08:00:00'),
    busyEnd: d('2026-08-11T12:00:00'),
    busyStartDate: '2026-08-11',
    ctx: { restHours: 4, allowMultipleEventsSameDay: true },
  })
  assert.deepEqual(result, { eligible: false, reason: 'rest_violation' })
})

test('evaluateRangeEligibility wraps overnight end<=start before overlap checks', () => {
  const result = evaluateRangeEligibility({
    reqStart: d('2026-08-11T22:00:00'),
    reqEnd: d('2026-08-11T02:00:00'), // overnight → ends 02:00 next day
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-12T01:00:00'),
    busyEnd: d('2026-08-12T03:00:00'),
    busyStartDate: '2026-08-12',
    ctx: { restHours: 0, allowMultipleEventsSameDay: true },
  })
  assert.deepEqual(result, { eligible: false, reason: 'overlap' })
})

test('evaluateRangeEligibility skips min rest for short first same-day service when threshold set', () => {
  const shortFirstOk = evaluateRangeEligibility({
    reqStart: d('2026-08-11T08:00:00'),
    reqEnd: d('2026-08-11T10:00:00'), // 2h first
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-11T11:00:00'),
    busyEnd: d('2026-08-11T15:00:00'),
    busyStartDate: '2026-08-11',
    ctx: {
      restHours: 8,
      allowMultipleEventsSameDay: true,
      maxFirstEventDurationHours: 3,
    },
  })
  assert.deepEqual(shortFirstOk, { eligible: true })

  const longFirstBlocked = evaluateRangeEligibility({
    reqStart: d('2026-08-11T08:00:00'),
    reqEnd: d('2026-08-11T13:00:00'), // 5h first > threshold
    reqStartDate: '2026-08-11',
    busyStart: d('2026-08-11T14:00:00'),
    busyEnd: d('2026-08-11T18:00:00'),
    busyStartDate: '2026-08-11',
    ctx: {
      restHours: 8,
      allowMultipleEventsSameDay: true,
      maxFirstEventDurationHours: 3,
    },
  })
  assert.deepEqual(longFirstBlocked, { eligible: false, reason: 'rest_violation' })
})

test('isEligibleByName matches accent-insensitive names across assignment roles', () => {
  const ctx = {
    restHours: 8,
    allowMultipleEventsSameDay: true,
    busyAssignments: [
      {
        startDate: '2026-08-11',
        endDate: '2026-08-11',
        startTime: '09:00',
        endTime: '13:00',
        responsables: [{ name: 'José García' }],
      },
      {
        startDate: '2026-08-12',
        endDate: '2026-08-12',
        startTime: '10:00',
        endTime: '14:00',
        groups: [{ responsibleName: 'Maria López' }],
      },
    ],
  }

  assert.deepEqual(
    isEligibleByName('jose garcia', '2026-08-11T15:00:00', '2026-08-11T18:00:00', ctx),
    { eligible: false, reason: 'rest_violation' }
  )
  assert.deepEqual(
    isEligibleByName('Maria Lopez', '2026-08-12T10:30:00', '2026-08-12T12:00:00', ctx),
    { eligible: false, reason: 'overlap' }
  )
  assert.deepEqual(
    isEligibleByName('Other Person', '2026-08-11T10:00:00', '2026-08-11T12:00:00', ctx),
    { eligible: true }
  )
})

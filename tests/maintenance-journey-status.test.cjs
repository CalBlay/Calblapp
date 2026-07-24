const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  deriveJourneyTransitionTimes,
} = require('../src/lib/maintenanceJourneyStatus')

test('deriveJourneyTransitionTimes uses close time as next start on same-day en_curs -> espera handoff', () => {
  const result = deriveJourneyTransitionTimes({
    currentStatus: 'en_curs',
    nextStatus: 'espera',
    startTime: '9:30',
    endTime: '10:00',
    hasStaleOpenSegment: false,
  })

  assert.equal(result.closeSegmentEndTime, '10:00')
  assert.equal(result.newSegmentStartTime, '10:00')
  assert.equal(result.newSegmentEndTime, undefined)
  assert.equal(result.sameDayStatusHandoff, true)
})

test('deriveJourneyTransitionTimes keeps original start when finishing current segment', () => {
  const result = deriveJourneyTransitionTimes({
    currentStatus: 'en_curs',
    nextStatus: 'fet',
    startTime: '9:30',
    endTime: '10:00',
    hasStaleOpenSegment: false,
  })

  assert.equal(result.closeSegmentEndTime, '10:00')
  assert.equal(result.newSegmentStartTime, '09:30')
  assert.equal(result.newSegmentEndTime, '10:00')
  assert.equal(result.sameDayStatusHandoff, false)
})

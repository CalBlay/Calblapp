const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyMeetingDecisionsToDashboard,
  meetingDecisionKey,
} = require('../src/lib/quadrantsWeeklyMeeting')

const event = {
  id: 'event-1',
  code: 'E26001',
  day: '2026-09-15',
  start: '2026-09-15T18:00:00',
}

test('weekly meeting NO VA hides the event only in the selected department', () => {
  const decisions = [{
    id: 'decision-1',
    eventId: 'event-1',
    eventCode: 'E26001',
    eventDay: '2026-09-15',
    department: 'logistica',
    required: false,
    arrivalTime: '',
    updatedAt: '',
    updatedByName: '',
  }]

  const logistics = applyMeetingDecisionsToDashboard(
    'logistica',
    [event],
    [{ id: 'q1', eventId: 'event-1', code: 'E26001', startDate: '2026-09-15' }],
    decisions
  )
  const kitchen = applyMeetingDecisionsToDashboard('cuina', [event], [], decisions)
  const services = applyMeetingDecisionsToDashboard('serveis', [event], [], decisions)

  assert.equal(logistics.events.length, 0)
  assert.equal(logistics.quadrants.length, 0)
  assert.equal(kitchen.events.length, 1)
  assert.equal(services.events.length, 1)
})

test('weekly meeting arrival time is overlaid without mutating the source rows', () => {
  const sourceEvent = { ...event }
  const sourceQuadrant = {
    id: 'q1',
    eventId: 'event-1',
    code: 'E26001',
    startDate: '2026-09-15',
    phaseType: 'event',
    arrivalTime: '10:00',
  }
  const result = applyMeetingDecisionsToDashboard(
    'cuina',
    [sourceEvent],
    [sourceQuadrant],
    [{
      id: 'decision-2',
      eventId: 'event-1',
      eventCode: 'E26001',
      eventDay: '2026-09-15',
      department: 'cuina',
      required: true,
      arrivalTime: '17:00',
      updatedAt: '',
      updatedByName: '',
    }]
  )

  assert.equal(result.events[0].arrivalTime, '17:00')
  assert.equal(result.quadrants[0].arrivalTime, '17:00')
  assert.equal(sourceQuadrant.arrivalTime, '10:00')
})

test('meeting decision keys distinguish day and department', () => {
  assert.notEqual(
    meetingDecisionKey('event-1', '2026-09-15', 'logistica'),
    meetingDecisionKey('event-1', '2026-09-15', 'cuina')
  )
  assert.notEqual(
    meetingDecisionKey('event-1', '2026-09-15', 'cuina'),
    meetingDecisionKey('event-1', '2026-09-16', 'cuina')
  )
})

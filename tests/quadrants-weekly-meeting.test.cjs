const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  applyMeetingDecisionsToDashboard,
  canEditMeetingCommentDepartment,
  meetingDecisionKey,
  normalizeMeetingCommentDepartment,
} = require('../src/lib/quadrantsWeeklyMeeting')
const {
  buildQuadrantsPageEvents,
} = require('../src/app/menu/quadrants/hooks/useQuadrantsPageData')
const { groupQuadrantsByDayAndEvent } = require('../src/lib/quadrantsGrouping')

const event = {
  id: 'event-1',
  code: 'E26001',
  day: '2026-09-15',
  start: '2026-09-15T18:00:00',
}

test('weekly meeting NO VA keeps the full weekly event list in every department', () => {
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

  assert.equal(logistics.events.length, 1)
  assert.equal(logistics.quadrants.length, 1)
  assert.equal(kitchen.events.length, 1)
  assert.equal(services.events.length, 1)
})

test('weekly meeting source contains every Services card, including operational phase days', () => {
  const rows = buildQuadrantsPageEvents({
    events: [{
      id: 'event-1',
      code: 'E26001',
      summary: 'Casament',
      start: '2026-11-28T18:00:00',
      end: '2026-11-28T23:00:00',
      originalStart: '2026-11-28',
      originalEnd: '2026-11-28',
      location: 'Finca',
      numPax: 100,
    }],
    quadrants: [{
      id: 'setup-1',
      eventId: 'event-1',
      code: 'E26001',
      eventName: 'Casament',
      department: 'serveis',
      phaseType: 'muntatge',
      phaseLabel: 'Muntatge',
      phaseDate: '2026-11-27',
      startDate: '2026-11-27',
      endDate: '2026-11-27',
      startTime: '10:00',
      endTime: '14:00',
      status: 'confirmed',
    }],
    filters: {
      start: '2026-11-23',
      end: '2026-11-29',
      ln: 'all',
      responsable: '__all__',
      location: '__all__',
      status: '__all__',
    },
  })
  const cards = groupQuadrantsByDayAndEvent(rows)

  assert.equal(cards.reduce((total, day) => total + day.events.length, 0), 2)
  assert.deepEqual(cards.map((day) => day.day), ['2026-11-27', '2026-11-28'])
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

test('meeting comment departments accept the three operational departments', () => {
  assert.equal(normalizeMeetingCommentDepartment('Serveis'), 'serveis')
  assert.equal(normalizeMeetingCommentDepartment('Logística'), 'logistica')
  assert.equal(normalizeMeetingCommentDepartment('CUINA'), 'cuina')
  assert.equal(normalizeMeetingCommentDepartment('Empresa'), null)
})

test('a department can edit only its own meeting observations', () => {
  assert.equal(canEditMeetingCommentDepartment('Logística', 'logistica'), true)
  assert.equal(canEditMeetingCommentDepartment('Logística', 'cuina'), false)
  assert.equal(canEditMeetingCommentDepartment('Empresa', 'serveis'), false)
})

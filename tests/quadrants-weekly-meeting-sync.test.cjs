const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildWeeklyMeetingServicesSetup,
  buildWeeklyMeetingArrivalPatch,
  isWeeklyMeetingEventPhase,
  matchesWeeklyMeetingQuadrantEvent,
  matchesWeeklyMeetingQuadrantDay,
} = require('../src/lib/quadrantsWeeklyMeetingSync.ts')

test('weekly meeting identifies current and legacy event phase labels', () => {
  assert.equal(isWeeklyMeetingEventPhase({ phaseType: 'event' }), true)
  assert.equal(isWeeklyMeetingEventPhase({ phaseLabel: 'Esdeveniment' }), true)
  assert.equal(isWeeklyMeetingEventPhase({}), true)
  assert.equal(isWeeklyMeetingEventPhase({ phaseType: 'entrega' }), false)
  assert.equal(isWeeklyMeetingEventPhase({ phaseType: 'recollida' }), false)
})

test('logistics weekly meeting hour reaches every arrival-time source', () => {
  const patch = buildWeeklyMeetingArrivalPatch({
    raw: {
      responsable: { name: 'Responsable', arrivalTime: '08:00' },
      conductors: [{ name: 'Conductor', arrivalTime: '08:00' }],
      treballadors: [{ name: 'Treballador', arrivalTime: '08:00' }],
      vehicles: [{ plate: '1234ABC', arrivalTime: '08:00' }],
      roleLines: [{ role: 'conductor', arrivalTime: '08:00' }],
      workerDetails: { worker1: { name: 'Treballador', arrivalTime: '08:00' } },
      groups: [{
        id: 'event',
        arrivalTime: '08:00',
        roleLines: [{ role: 'treballador', arrivalTime: '08:00' }],
      }],
    },
    required: true,
    arrivalTime: '17:30',
    updatedAt: '2026-09-28T10:00:00.000Z',
  })

  assert.equal(patch.arrivalTime, '17:30')
  assert.equal(patch.responsable.arrivalTime, '17:30')
  assert.equal(patch.conductors[0].arrivalTime, '17:30')
  assert.equal(patch.treballadors[0].arrivalTime, '17:30')
  assert.equal(patch.vehicles[0].arrivalTime, '17:30')
  assert.equal(patch.roleLines[0].arrivalTime, '17:30')
  assert.equal(patch.workerDetails.worker1.arrivalTime, '17:30')
  assert.equal(patch.groups[0].arrivalTime, '17:30')
  assert.equal(patch.groups[0].roleLines[0].arrivalTime, '17:30')
})

test('NO VA records the decision without overwriting logistics arrival times', () => {
  const patch = buildWeeklyMeetingArrivalPatch({
    raw: { arrivalTime: '08:00' },
    required: false,
    arrivalTime: '',
    updatedAt: '2026-09-28T10:00:00.000Z',
  })

  assert.deepEqual(patch, {
    weeklyMeetingRequired: false,
    weeklyMeetingUpdatedAt: '2026-09-28T10:00:00.000Z',
  })
})

test('weekly meeting matches every quadrant phase for the selected event and day', () => {
  const rows = [
    {
      id: 'event-1__event__2026-10-06__group',
      eventId: 'event-1',
      phaseType: 'event',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
    },
    {
      id: 'event-1__entrega__2026-10-06__group',
      eventId: 'event-1',
      phaseType: 'entrega',
      phaseDate: '2026-10-06',
    },
    {
      id: 'event-1__event__2026-10-07__group',
      eventId: 'event-1',
      phaseType: 'event',
      startDate: '2026-10-07',
      endDate: '2026-10-07',
    },
    {
      id: 'event-2__event__2026-10-06__group',
      eventId: 'event-2',
      eventCode: 'E2',
      phaseType: 'event',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
    },
  ]

  const matches = rows.filter((row) =>
    matchesWeeklyMeetingQuadrantDay(row, 'event-1', 'E1', '2026-10-06')
  )

  assert.deepEqual(matches.map((row) => row.phaseType), ['event', 'entrega'])
})

test('weekly meeting can match legacy quadrant documents by event code', () => {
  assert.equal(
    matchesWeeklyMeetingQuadrantDay(
      {
        eventId: 'legacy-id',
        code: 'E2600594',
        startDate: '2026-10-06',
        endDate: '2026-10-06',
      },
      'current-id',
      'E2600594',
      '2026-10-06'
    ),
    true
  )
})

test('weekly meeting matches setup phases by event even when setup is on another day', () => {
  const setup = {
    eventId: 'event-1',
    phaseType: 'muntatge',
    phaseDate: '2026-10-05',
  }

  assert.equal(matchesWeeklyMeetingQuadrantEvent(setup, 'event-1', 'E1'), true)
  assert.equal(matchesWeeklyMeetingQuadrantDay(setup, 'event-1', 'E1', '2026-10-06'), false)
})

test('weekly meeting formats and deduplicates serveis setup day and hours', () => {
  const setup = buildWeeklyMeetingServicesSetup([
    {
      id: 'event-1__muntatge__2026-10-05__group-a',
      eventId: 'event-1',
      phaseType: 'muntatge',
      phaseDate: '2026-10-05',
      startTime: '09:00',
      endTime: '13:30',
      conductors: [{ id: 'c1', name: 'Aaron Bouazza' }],
      treballadors: [{ id: 'w1', name: 'Adri Alvarez' }],
    },
    {
      id: 'event-1__muntatge__2026-10-05__group-a-copy',
      eventId: 'event-1',
      phaseLabel: 'Muntatge',
      startDate: '2026-10-05',
      startTime: '09:00',
      endTime: '13:30',
    },
    {
      eventId: 'event-1',
      phaseType: 'event',
      startDate: '2026-10-06',
      startTime: '18:00',
    },
  ])

  assert.equal(
    setup,
    '05/10/2026 · 09:00–13:30 · Aaron Bouazza, Adri Alvarez'
  )
})

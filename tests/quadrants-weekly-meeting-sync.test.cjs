const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildWeeklyMeetingArrivalPatch,
  isWeeklyMeetingEventPhase,
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

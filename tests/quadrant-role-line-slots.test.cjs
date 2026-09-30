const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resizeRoleLinesToTotalPersonSlots,
  resizeStaffRoleLineSlots,
} = require('../src/app/menu/quadrants/[id]/lib/resizeRoleLineSlots')
const {
  resizeLogisticPhaseToTotalPersonSlots,
} = require('../src/app/menu/quadrants/[id]/lib/logisticPhaseRoleLines')

const line = (slotId, role, personId = '') => ({
  slotId,
  role,
  personId,
  personName: '',
  serviceDate: '2026-09-30',
  meetingPoint: 'CENTRAL',
  startTime: '10:00',
  endTime: '18:00',
})

test('crea les files de treballador fins al total de persones demanat', () => {
  let created = 0
  const resized = resizeRoleLinesToTotalPersonSlots({
    roleLines: [line('driver', 'conductor')],
    targetCount: 4,
    createStaffLine: () => line(`worker-${++created}`, 'treballador'),
  })

  assert.equal(resized.length, 4)
  assert.equal(resized.filter((entry) => entry.role === 'treballador').length, 3)
})

test('en reduir conserva abans les files amb persones assignades', () => {
  const resized = resizeStaffRoleLineSlots({
    roleLines: [
      line('empty-1', 'treballador'),
      line('assigned', 'treballador', 'person-1'),
      line('empty-2', 'treballador'),
    ],
    targetCount: 1,
    createStaffLine: () => line('new', 'treballador'),
  })

  assert.deepEqual(resized.map((entry) => entry.slotId), ['assigned'])
})

test('limita el nombre màxim de persones a trenta', () => {
  let created = 0
  const resized = resizeStaffRoleLineSlots({
    roleLines: [],
    targetCount: 100,
    createStaffLine: () => line(`worker-${++created}`, 'treballador'),
  })

  assert.equal(resized.length, 30)
})

test('logística crea automàticament els espais indicats i conserva el conductor', () => {
  const form = {
    startDate: '2026-09-30',
    endDate: '2026-09-30',
    startTime: '10:00',
    endTime: '18:00',
    arrivalTime: '09:30',
    workers: 0,
    drivers: 1,
    meetingPoint: 'CENTRAL',
    workerIds: [],
    workerDetails: {},
  }
  const assignments = [
    {
      slotId: 'vehicle-1',
      vehicleType: 'furgoneta',
      vehicleId: 'vehicle-id',
      plate: '1234ABC',
      conductorId: 'driver-id',
      arrivalTime: '09:30',
    },
  ]

  const resized = resizeLogisticPhaseToTotalPersonSlots(form, assignments, 4)

  assert.equal(resized.formPatch.roleLines.length, 4)
  assert.equal(resized.formPatch.workers, 3)
  assert.equal(resized.formPatch.drivers, 1)
  assert.equal(resized.assignments[0].conductorId, 'driver-id')
})

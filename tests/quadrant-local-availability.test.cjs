const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildReservedForRoleLine,
  collectConflictingVehicleIdsForRoleLine,
  dedupeRoleLinePersonAssignments,
  findDuplicateRoleLinePersonKeys,
} = require('../src/app/menu/quadrants/[id]/lib/quadrantPayloadShared')

const rules = {
  restHours: 0,
  allowMultipleEventsSameDay: true,
  maxFirstEventDurationHours: 24,
}

const line = (slotId, serviceDate, startTime, endTime, personId = '') => ({
  slotId,
  serviceDate,
  startTime,
  endTime,
  personId,
  personName: personId === 'driver-1' ? 'Humberto' : '',
})

test('a driver assigned on another day stays available in the same quadrant', () => {
  const delivery = line('delivery', '2026-10-19', '12:00', '14:59', 'driver-1')
  const pickup = line('pickup', '2026-10-20', '12:00', '23:59')

  const reserved = buildReservedForRoleLine(
    [delivery, pickup],
    pickup,
    undefined,
    undefined,
    rules
  )

  assert.equal(reserved.has('driver-1'), false)
  assert.deepEqual(findDuplicateRoleLinePersonKeys([
    delivery,
    { ...pickup, personId: 'driver-1', personName: 'Humberto' },
  ], rules), [])
})

test('overlapping local assignments still reserve the driver', () => {
  const first = line('first', '2026-10-19', '12:00', '15:00', 'driver-1')
  const second = line('second', '2026-10-19', '14:00', '18:00')

  const reserved = buildReservedForRoleLine(
    [first, second],
    second,
    undefined,
    undefined,
    rules
  )

  assert.equal(reserved.has('driver-1'), true)
})

test('same-day non-overlapping assignments follow the multiple-services premise', () => {
  const first = line('first', '2026-10-19', '08:00', '10:00', 'driver-1')
  const second = line('second', '2026-10-19', '12:00', '14:00')

  const allowed = buildReservedForRoleLine(
    [first, second], second, undefined, undefined, rules
  )
  const denied = buildReservedForRoleLine(
    [first, second],
    second,
    undefined,
    undefined,
    { ...rules, allowMultipleEventsSameDay: false }
  )

  assert.equal(allowed.has('driver-1'), false)
  assert.equal(denied.has('driver-1'), true)
})

test('selecting the same driver in non-conflicting phases keeps both assignments', () => {
  const delivery = line('delivery', '2026-11-04', '15:30', '18:00', 'driver-1')
  const pickup = line('pickup', '2026-11-05', '15:30', '18:00', 'driver-1')

  const result = dedupeRoleLinePersonAssignments(
    [delivery, pickup],
    pickup.slotId,
    rules
  )

  assert.equal(result[0].personId, 'driver-1')
  assert.equal(result[1].personId, 'driver-1')
})

test('the same vehicle is reusable in non-overlapping logistics phases', () => {
  const delivery = line('delivery', '2026-11-04', '15:30', '18:00')
  const pickup = line('pickup', '2026-11-05', '15:30', '18:00')
  const reservations = [{ vehicleId: 'vehicle-1', line: delivery }]

  const reusable = collectConflictingVehicleIdsForRoleLine(reservations, pickup, rules)
  const overlapping = collectConflictingVehicleIdsForRoleLine(
    reservations,
    { ...pickup, serviceDate: '2026-11-04' },
    rules
  )

  assert.equal(reusable.has('vehicle-1'), false)
  assert.equal(overlapping.has('vehicle-1'), true)
})

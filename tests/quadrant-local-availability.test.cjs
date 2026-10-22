const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  buildReservedForRoleLine,
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

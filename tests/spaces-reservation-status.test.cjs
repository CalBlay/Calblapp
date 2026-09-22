const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isActiveSpaceReservation,
  isSpaceReservationCancelled,
} = require('../src/lib/spacesReservationStatus.ts')

test('només cancelled=true marca una reserva com a cancel·lada', () => {
  assert.equal(isSpaceReservationCancelled({ cancelled: true }), true)
  assert.equal(isSpaceReservationCancelled({ cancelled: false }), false)
  assert.equal(isSpaceReservationCancelled({}), false)
})

test('les reserves cancel·lades no són actives per als totals', () => {
  assert.equal(isActiveSpaceReservation({ cancelled: true }), false)
  assert.equal(isActiveSpaceReservation({ cancelled: false }), true)
  assert.equal(isActiveSpaceReservation({}), true)
})

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isExcludedVehicleAvailabilityQuadrant,
} = require('../src/lib/vehicleAvailability')

test('vehicle availability excludes every phase document of the event being edited', () => {
  assert.equal(
    isExcludedVehicleAvailabilityQuadrant(
      { docId: 'event-1__entrega__2026-11-04', eventId: 'event-1' },
      'event-1'
    ),
    true
  )
  assert.equal(
    isExcludedVehicleAvailabilityQuadrant(
      { docId: 'event-1__recollida__2026-11-05' },
      'event-1'
    ),
    true
  )
})

test('vehicle availability keeps occupations from other events', () => {
  assert.equal(
    isExcludedVehicleAvailabilityQuadrant(
      { docId: 'event-10__entrega__2026-11-04', eventId: 'event-10' },
      'event-1'
    ),
    false
  )
  assert.equal(
    isExcludedVehicleAvailabilityQuadrant(
      { docId: 'event-2__entrega__2026-11-04', eventId: 'event-2' },
      'event-1'
    ),
    false
  )
})

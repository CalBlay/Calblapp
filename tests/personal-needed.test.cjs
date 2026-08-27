const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  calculatePersonalNeeded,
  calculateServeisStaffSlots,
} = require('../src/utils/calculatePersonalNeeded')

test('calculatePersonalNeeded subtracts drivers and responsable without double-counting', () => {
  assert.equal(
    calculatePersonalNeeded({
      staffCount: 5,
      drivers: [{ name: 'Anna' }, { name: 'Pau' }],
      responsableName: 'Marta',
    }),
    2
  )

  assert.equal(
    calculatePersonalNeeded({
      staffCount: 5,
      drivers: ['Marta', 'Pau'],
      responsableName: 'Màrta',
    }),
    3
  )

  assert.equal(
    calculatePersonalNeeded({
      staffCount: 4,
      drivers: ['Pau'],
      responsableName: 'Marta',
      requestedDrivers: 3,
    }),
    0
  )
})

test('calculateServeisStaffSlots counts unique people including responsable-as-driver', () => {
  assert.equal(
    calculateServeisStaffSlots({
      staffCount: 6,
      drivers: [{ name: 'Pau' }, { name: 'Anna' }],
      responsableName: 'Marta',
    }),
    3
  )
  assert.equal(
    calculateServeisStaffSlots({
      staffCount: 4,
      drivers: ['Josép'],
      responsableName: 'Josep',
    }),
    3
  )
  assert.equal(
    calculateServeisStaffSlots({
      staffCount: 1,
      drivers: ['Pau', 'Anna'],
      responsableName: 'Marta',
    }),
    0
  )
})

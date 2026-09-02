const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  baseCanValidateReservaComercials,
  baseCanKeysHandoverReservaComercials,
} = require('../src/lib/reservaComercialsPermissions')

test('baseCanValidateReservaComercials is admin or transport lead only', () => {
  assert.equal(baseCanValidateReservaComercials(undefined), false)
  assert.equal(baseCanValidateReservaComercials({}), false)
  assert.equal(baseCanValidateReservaComercials({ role: 'admin' }), true)
  assert.equal(baseCanValidateReservaComercials({ role: 'Admin' }), true)
  assert.equal(
    baseCanValidateReservaComercials({ role: 'treballador', isTransportLead: true }),
    true
  )
  assert.equal(baseCanValidateReservaComercials({ role: 'direccio' }), false)
  assert.equal(baseCanValidateReservaComercials({ role: 'Direcció' }), false)
  assert.equal(
    baseCanValidateReservaComercials({ role: 'cap', department: 'logistica' }),
    false
  )
  assert.equal(baseCanValidateReservaComercials({ role: 'treballador' }), false)
})

test('baseCanKeysHandoverReservaComercials allows admin, direcció, transport lead, or cap logística', () => {
  assert.equal(baseCanKeysHandoverReservaComercials(undefined), false)
  assert.equal(baseCanKeysHandoverReservaComercials({ role: 'admin' }), true)
  assert.equal(baseCanKeysHandoverReservaComercials({ role: 'Direcció' }), true)
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'treballador', isTransportLead: true }),
    true
  )
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'cap', department: 'Logística' }),
    true
  )
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'cap', department: 'cuina' }),
    false
  )
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'treballador', department: 'logistica' }),
    false
  )
})

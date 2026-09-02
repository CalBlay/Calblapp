const assert = require('node:assert/strict')
const { test } = require('node:test')

const { parseActionPermission } = require('../src/lib/permissionKeys')
const {
  baseCanAttachEventVisitVideo,
} = require('../src/lib/eventVisitVideoPermissions')
const {
  baseCanKeysHandoverReservaComercials,
  baseCanValidateReservaComercials,
} = require('../src/lib/reservaComercialsPermissions')
const {
  canAccessQuadrantsPremissesDepartment,
} = require('../src/lib/quadrantsPermissions')

test('parseActionPermission splits path from colon-containing action keys', () => {
  assert.deepEqual(parseActionPermission('ui:action:/menu/calendar:manual:create'), {
    path: '/menu/calendar',
    action: 'manual:create',
  })
  assert.deepEqual(
    parseActionPermission('ui:action:/menu/events:docs:attach:visit-video'),
    { path: '/menu/events', action: 'docs:attach:visit-video' }
  )
  assert.equal(parseActionPermission('ui:view:/menu/calendar'), null)
  assert.equal(parseActionPermission('ui:action:calendar:manual:create'), null)
  assert.equal(parseActionPermission(''), null)
})

test('baseCanAttachEventVisitVideo is admin/direcció/comercial or cap of commercial departments', () => {
  assert.equal(baseCanAttachEventVisitVideo({ role: 'admin' }), true)
  assert.equal(baseCanAttachEventVisitVideo({ role: 'Direcció' }), true)
  assert.equal(baseCanAttachEventVisitVideo({ role: 'comercial', department: 'cuina' }), true)
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'cap', department: 'Food Lover' }),
    true
  )
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'Cap Departament', department: 'Empresa' }),
    true
  )
  assert.equal(baseCanAttachEventVisitVideo({ role: 'cap', department: 'cuina' }), false)
  assert.equal(
    baseCanAttachEventVisitVideo({ role: 'treballador', department: 'comercial' }),
    false
  )
})

test('reserva comercials validate is admin or transport lead; keys also allow direcció and cap logística', () => {
  assert.equal(baseCanValidateReservaComercials({ role: 'admin' }), true)
  assert.equal(
    baseCanValidateReservaComercials({ role: 'treballador', isTransportLead: true }),
    true
  )
  assert.equal(baseCanValidateReservaComercials({ role: 'direccio' }), false)
  assert.equal(
    baseCanValidateReservaComercials({ role: 'cap', department: 'logistica' }),
    false
  )
  assert.equal(baseCanValidateReservaComercials(undefined), false)

  assert.equal(baseCanKeysHandoverReservaComercials({ role: 'direccio' }), true)
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'cap', department: 'Logística' }),
    true
  )
  assert.equal(
    baseCanKeysHandoverReservaComercials({ role: 'cap', department: 'cuina' }),
    false
  )
})

test('quadrants premisses department access is admin/direcció all depts, cap only own dept', () => {
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'admin',
      sessionDept: 'serveis',
      requestedDept: 'cuina',
    }),
    true
  )
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'Direcció',
      sessionDept: '',
      requestedDept: 'logistica',
    }),
    true
  )
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'cap',
      sessionDept: 'Logística',
      requestedDept: 'logistica',
    }),
    true
  )
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'cap',
      sessionDept: 'logistica',
      requestedDept: 'cuina',
    }),
    false
  )
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'treballador',
      sessionDept: 'cuina',
      requestedDept: 'cuina',
    }),
    false
  )
})

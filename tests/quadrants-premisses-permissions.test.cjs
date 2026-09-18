const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  QUADRANTS_REOPEN_PERM,
  baseCanEditQuadrantsPremisses,
  canAccessQuadrantsPremissesDepartment,
  hasQuadrantsReopenAction,
  isQuadrantRecordConfirmed,
} = require('../src/lib/quadrantsPermissions')

test('baseCanEditQuadrantsPremisses is admin, direcció, or cap', () => {
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'admin' }), true)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'direccio' }), true)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'Direcció' }), true)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'cap' }), true)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'treballador' }), false)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'comercial' }), false)
  assert.equal(baseCanEditQuadrantsPremisses({ role: 'usuari' }), false)
  assert.equal(baseCanEditQuadrantsPremisses(undefined), false)
})

test('canAccessQuadrantsPremissesDepartment lets admin and direcció use any department', () => {
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'admin',
      sessionDept: 'cuina',
      requestedDept: 'logistica',
    }),
    true
  )
  assert.equal(
    canAccessQuadrantsPremissesDepartment({
      role: 'direccio',
      sessionDept: '',
      requestedDept: 'serveis',
    }),
    true
  )
})

test('canAccessQuadrantsPremissesDepartment lets cap edit only their own department', () => {
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
      sessionDept: 'cuina',
      requestedDept: 'serveis',
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

test('isQuadrantRecordConfirmed treats any confirmed signal as confirmed', () => {
  assert.equal(isQuadrantRecordConfirmed({ status: 'draft', state: 'confirmed' }), true)
  assert.equal(isQuadrantRecordConfirmed({ status: 'confirmed' }), true)
  assert.equal(isQuadrantRecordConfirmed({ quadrantStatus: 'confirmed' }), true)
  assert.equal(isQuadrantRecordConfirmed({ status: 'draft', confirmed: true }), true)
  assert.equal(isQuadrantRecordConfirmed({ status: 'draft', confirmedAt: '2026-09-18' }), true)
  assert.equal(isQuadrantRecordConfirmed({ status: 'draft' }), false)
  assert.equal(isQuadrantRecordConfirmed(null), false)
})

test('hasQuadrantsReopenAction only follows the dedicated reopen permission', () => {
  assert.equal(QUADRANTS_REOPEN_PERM, 'ui:action:/menu/quadrants:draft:unconfirm')
  assert.equal(hasQuadrantsReopenAction((key) => key === QUADRANTS_REOPEN_PERM), true)
  assert.equal(
    hasQuadrantsReopenAction((key) => key === 'ui:action:/menu/quadrants:confirm'),
    false
  )
  assert.equal(
    hasQuadrantsReopenAction((key) => key === 'ui:action:/menu/quadrants:draft:delete'),
    false
  )
})

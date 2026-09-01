const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  baseCanEditQuadrantsPremisses,
  canAccessQuadrantsPremissesDepartment,
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

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeAuditDepartment,
  normalizeCommercialAuditGroup,
  resolveAuditDepartmentForUser,
} = require('../src/lib/auditDepartment')

test('normalizeAuditDepartment maps aliases and strips accents', () => {
  assert.equal(normalizeAuditDepartment('Logística'), 'logistica')
  assert.equal(normalizeAuditDepartment('sala'), 'serveis')
  assert.equal(normalizeAuditDepartment('Serveis'), 'serveis')
  assert.equal(normalizeAuditDepartment('Decoració'), 'deco')
  assert.equal(normalizeAuditDepartment('decoracions'), 'deco')
  assert.equal(normalizeAuditDepartment('cuina'), 'cuina')
  assert.equal(normalizeAuditDepartment('comercial'), 'comercial')
  assert.equal(normalizeAuditDepartment('unknown'), null)
  assert.equal(normalizeAuditDepartment(null), null)
})

test('normalizeCommercialAuditGroup compactifies spaces and aliases', () => {
  assert.equal(normalizeCommercialAuditGroup('empresa'), 'empresa')
  assert.equal(normalizeCommercialAuditGroup('casament'), 'casaments')
  assert.equal(normalizeCommercialAuditGroup('Casaments'), 'casaments')
  assert.equal(normalizeCommercialAuditGroup('Food Lover'), 'foodlovers')
  assert.equal(normalizeCommercialAuditGroup('foodlovers'), 'foodlovers')
  assert.equal(normalizeCommercialAuditGroup('sala'), null)
})

test('resolveAuditDepartmentForUser maps commercial groups onto comercial', () => {
  assert.equal(resolveAuditDepartmentForUser('casaments'), 'comercial')
  assert.equal(resolveAuditDepartmentForUser('empresa'), 'comercial')
  assert.equal(resolveAuditDepartmentForUser('Food Lover'), 'comercial')
  assert.equal(resolveAuditDepartmentForUser('sala'), 'serveis')
  assert.equal(resolveAuditDepartmentForUser('deco'), 'deco')
  assert.equal(resolveAuditDepartmentForUser('altres'), null)
})

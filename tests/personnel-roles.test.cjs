const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normPersonRole, isResponsiblePerson } = require('../src/lib/personnelRoles')

test('normPersonRole unaccents, lowercases, and maps soldat to equip', () => {
  assert.equal(normPersonRole('  Responsable  '), 'responsable')
  assert.equal(normPersonRole('Cap Departament'), 'cap departament')
  assert.equal(normPersonRole('Soldat'), 'equip')
  assert.equal(normPersonRole(null), '')
})

test('isResponsiblePerson honors flag and responsible role aliases', () => {
  assert.equal(isResponsiblePerson(null), false)
  assert.equal(isResponsiblePerson({ isResponsible: true, role: 'equip' }), true)
  assert.equal(isResponsiblePerson({ role: 'Responsable' }), true)
  assert.equal(isResponsiblePerson({ role: 'Cap Departament' }), true)
  assert.equal(isResponsiblePerson({ role: 'capdepartament' }), true)
  assert.equal(isResponsiblePerson({ role: 'Supervisor' }), true)
  assert.equal(isResponsiblePerson({ role: 'equip' }), false)
  assert.equal(isResponsiblePerson({ isResponsible: false, role: 'cambrer' }), false)
})

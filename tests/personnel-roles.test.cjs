const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normPersonRole,
  isResponsiblePerson,
  isSelectableResponsible,
} = require('../src/lib/personnelRoles')

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

test('a responsible is blocked only by a real schedule overlap', () => {
  const responsible = { role: 'Responsable', status: 'conflict' }

  assert.equal(
    isSelectableResponsible({ ...responsible, conflictType: 'same_day_not_allowed' }),
    true
  )
  assert.equal(
    isSelectableResponsible({ ...responsible, conflictType: 'rest_violation' }),
    true
  )
  assert.equal(
    isSelectableResponsible({ ...responsible, conflictType: 'overlap' }),
    false
  )
  assert.equal(
    isSelectableResponsible({ ...responsible, reason: 'Ja assignat en aquest rang' }),
    false
  )
  assert.equal(
    isSelectableResponsible({ role: 'treballador', status: 'available' }),
    false
  )
})

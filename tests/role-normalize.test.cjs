const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normalizeRole } = require('../src/lib/roles')

test('normalizeRole maps accented titles and common aliases', () => {
  assert.equal(normalizeRole('Admin'), 'admin')
  assert.equal(normalizeRole('Direcció'), 'direccio')
  assert.equal(normalizeRole('direccion'), 'direccio')
  assert.equal(normalizeRole('Cap Departament'), 'cap')
  assert.equal(normalizeRole('capdepartament'), 'cap')
  assert.equal(normalizeRole('Departament de cap'), 'cap')
  assert.equal(normalizeRole('trabajador'), 'treballador')
  assert.equal(normalizeRole('worker'), 'treballador')
  assert.equal(normalizeRole('empleat'), 'treballador')
  assert.equal(normalizeRole('observador'), 'observer')
  assert.equal(normalizeRole('user'), 'usuari')
  assert.equal(normalizeRole('invitado'), 'usuari')
})

test('normalizeRole defaults unknown or empty input to treballador', () => {
  assert.equal(normalizeRole(null), 'treballador')
  assert.equal(normalizeRole(undefined), 'treballador')
  assert.equal(normalizeRole(''), 'treballador')
  assert.equal(normalizeRole('   '), 'treballador')
  assert.equal(normalizeRole('super-admin'), 'treballador')
  assert.equal(normalizeRole('manager'), 'treballador')
})

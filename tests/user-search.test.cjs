const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  foldUserSearchText,
  matchesUserSearch,
} = require('../src/lib/userSearch')

test('foldUserSearchText strips accents and lowercases', () => {
  assert.equal(foldUserSearchText('  Sònia Plànas  '), 'sonia planas')
  assert.equal(foldUserSearchText(null), '')
  assert.equal(foldUserSearchText(undefined), '')
})

test('matchesUserSearch requires every token somewhere in the user fields', () => {
  const user = {
    id: 'u-12',
    name: 'Sònia Albet',
    email: 'sonia.albet@calblay.com',
    department: 'Cuina',
    role: 'cap',
  }

  assert.equal(matchesUserSearch(user, ''), true)
  assert.equal(matchesUserSearch(user, '   '), true)
  assert.equal(matchesUserSearch(user, 'sonia'), true)
  assert.equal(matchesUserSearch(user, 'SONIA cuina'), true)
  assert.equal(matchesUserSearch(user, 'albet cap'), true)
  assert.equal(matchesUserSearch(user, 'u-12'), true)
  assert.equal(matchesUserSearch(user, 'sonia planas'), false)
  assert.equal(matchesUserSearch(user, 'logistica'), false)
})

test('matchesUserSearch can match commercial name or phone tokens', () => {
  const user = {
    name: 'Oriol',
    commercialName: 'Cal Blay Comercial',
    phone: '+34 600 111 222',
  }

  assert.equal(matchesUserSearch(user, 'comercial'), true)
  assert.equal(matchesUserSearch(user, '600'), true)
  assert.equal(matchesUserSearch(user, 'oriol 999'), false)
})

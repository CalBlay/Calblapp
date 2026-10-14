const assert = require('node:assert/strict')
const { test } = require('node:test')

const { normalizeMenuId } = require('../src/app/menu/allergens/bbdd/utils')

test('normalizeMenuId preserves valid IDs and encodes Firestore path separators', () => {
  assert.equal(normalizeMenuId('C1'), 'C1')
  assert.equal(normalizeMenuId('  Menú diari  '), 'Menú diari')
  assert.equal(
    normalizeMenuId('Paelles Show/Concurs'),
    'Paelles%20Show%2FConcurs'
  )
})

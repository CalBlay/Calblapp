const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeSpacesLn,
  isGrupsRestaurantsLn,
  spacesLnFilterMatches,
} = require('../src/lib/spacesLn')

test('normalizeSpacesLn folds accents, aliases restaurants, and collapses whitespace', () => {
  assert.equal(normalizeSpacesLn(null), '')
  assert.equal(normalizeSpacesLn('  '), '')
  assert.equal(normalizeSpacesLn('  Empresa  '), 'empresa')
  assert.equal(normalizeSpacesLn('Restauració'), 'grups restaurants')
  assert.equal(normalizeSpacesLn('restaurants'), 'grups restaurants')
  assert.equal(normalizeSpacesLn('Grups   Restaurants'), 'grups restaurants')
})

test('isGrupsRestaurantsLn matches normalized grup+restaurant labels', () => {
  assert.equal(isGrupsRestaurantsLn('restaurants'), true)
  assert.equal(isGrupsRestaurantsLn('grups restaurants'), true)
  assert.equal(isGrupsRestaurantsLn('empresa'), false)
  assert.equal(isGrupsRestaurantsLn(''), false)
})

test('spacesLnFilterMatches treats empty filters or empty LN as pass-through', () => {
  assert.equal(spacesLnFilterMatches('empresa', []), true)
  assert.equal(spacesLnFilterMatches('', ['empresa']), true)
  assert.equal(spacesLnFilterMatches(null, ['empresa']), true)
})

test('spacesLnFilterMatches matches either direction of includes and can exclude grups restaurants', () => {
  assert.equal(spacesLnFilterMatches('Empresa', ['empresa']), true)
  assert.equal(spacesLnFilterMatches('restaurants', ['grups restaurants']), true)
  assert.equal(spacesLnFilterMatches('grups restaurants', ['restaurants']), true)
  assert.equal(spacesLnFilterMatches('agenda', ['empresa']), false)

  assert.equal(
    spacesLnFilterMatches('restaurants', ['empresa'], true),
    false
  )
  assert.equal(spacesLnFilterMatches('empresa', ['empresa'], true), true)
})

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeSpacesLn,
  isGrupsRestaurantsLn,
  spacesLnFilterMatches,
} = require('../src/lib/spacesLn')

test('normalizeSpacesLn folds accents and aliases restaurant variants', () => {
  assert.equal(normalizeSpacesLn('  Casaments  '), 'casaments')
  assert.equal(normalizeSpacesLn('Restauració'), 'grups restaurants')
  assert.equal(normalizeSpacesLn('restaurants'), 'grups restaurants')
  assert.equal(normalizeSpacesLn('Empreses   Extra'), 'empreses extra')
  assert.equal(normalizeSpacesLn(null), '')
})

test('isGrupsRestaurantsLn detects grup + restaurant combinations', () => {
  assert.equal(isGrupsRestaurantsLn('Grups Restaurants'), true)
  assert.equal(isGrupsRestaurantsLn('Restauració'), true)
  assert.equal(isGrupsRestaurantsLn('Casaments'), false)
  assert.equal(isGrupsRestaurantsLn(''), false)
})

test('spacesLnFilterMatches accepts empty filters and blank values', () => {
  assert.equal(spacesLnFilterMatches('Casaments', []), true)
  assert.equal(spacesLnFilterMatches('', ['casaments']), true)
  assert.equal(spacesLnFilterMatches(null, ['casaments']), true)
})

test('spacesLnFilterMatches compares with includes both ways after normalization', () => {
  assert.equal(spacesLnFilterMatches('Casaments', ['casament']), true)
  assert.equal(spacesLnFilterMatches('Empreses', ['empreses']), true)
  assert.equal(spacesLnFilterMatches('Foodlovers', ['casaments']), false)
  assert.equal(spacesLnFilterMatches('Grups Restaurants', ['restauració']), true)
})

test('spacesLnFilterMatches can exclude grups restaurants regardless of selected filters', () => {
  assert.equal(
    spacesLnFilterMatches('Grups Restaurants', ['grups restaurants'], true),
    false
  )
  assert.equal(spacesLnFilterMatches('Casaments', ['casaments'], true), true)
})

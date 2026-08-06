const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  normalizeIncidentLn,
  incidentMatchesLnFilter,
} = require('../src/lib/incidentLn')

test('normalizeIncidentLn folds accents, aliases restaurants, and defaults empty to altres', () => {
  assert.equal(normalizeIncidentLn(null), 'altres')
  assert.equal(normalizeIncidentLn(''), 'altres')
  assert.equal(normalizeIncidentLn('  Empresa  '), 'empresa')
  assert.equal(normalizeIncidentLn('Casaments'), 'casaments')
  assert.equal(normalizeIncidentLn('Restauració'), 'grups restaurants')
  assert.equal(normalizeIncidentLn('restaurants'), 'grups restaurants')
  assert.equal(normalizeIncidentLn('Foodlovers'), 'foodlovers')
})

test('incidentMatchesLnFilter treats all/empty as pass-through', () => {
  assert.equal(incidentMatchesLnFilter('empresa', 'all'), true)
  assert.equal(incidentMatchesLnFilter('empresa', null), true)
  assert.equal(incidentMatchesLnFilter('empresa', ''), true)
  assert.equal(incidentMatchesLnFilter(null, 'all'), true)
})

test('incidentMatchesLnFilter matches single and multi-select LN filters', () => {
  assert.equal(incidentMatchesLnFilter('Empresa', 'empresa'), true)
  assert.equal(incidentMatchesLnFilter('restaurants', 'grups restaurants'), true)
  assert.equal(incidentMatchesLnFilter('Restauració', 'grups restaurants'), true)
  assert.equal(incidentMatchesLnFilter('agenda', 'empresa'), false)

  assert.equal(
    incidentMatchesLnFilter('casaments', 'empresa,casaments,agenda'),
    true
  )
  assert.equal(
    incidentMatchesLnFilter('foodlovers', 'empresa, casaments'),
    false
  )
})

test('incidentMatchesLnFilter normalizes both sides so alias filters still match', () => {
  assert.equal(incidentMatchesLnFilter('grups restaurants', 'restaurants'), true)
  assert.equal(incidentMatchesLnFilter('restauracio', 'grups restaurants'), true)
  assert.equal(incidentMatchesLnFilter(null, 'altres'), true)
  assert.equal(incidentMatchesLnFilter('', 'altres'), true)
})

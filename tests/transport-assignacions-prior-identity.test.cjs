const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  matchesPriorConductorIdentity,
  shouldStripPriorConductorDuplicates,
  stripPriorConductorDuplicates,
} = require('../src/lib/transportAssignacionsPriorIdentity')

test('does not strip conductors when saving the same driver and plate (time-only edit)', () => {
  const prior = { name: 'Joan Puig', plate: '1234ABC' }
  const conductors = [
    { id: 'c1', name: 'Joan Puig', plate: '1234ABC', startTime: '09:00' },
    { id: 'c2', name: 'Maria Serra', plate: '5678DEF', startTime: '08:00' },
  ]

  assert.equal(
    shouldStripPriorConductorDuplicates({
      isExplicitEdit: true,
      replaced: true,
      priorConductor: prior,
      next: { name: 'Joan Puig', plate: '1234ABC' },
    }),
    false
  )

  const next = shouldStripPriorConductorDuplicates({
    isExplicitEdit: true,
    replaced: true,
    priorConductor: prior,
    next: { name: 'Joan Puig', plate: '1234ABC' },
  })
    ? stripPriorConductorDuplicates(conductors, prior)
    : conductors

  assert.equal(next.length, 2)
  assert.equal(next[0].id, 'c1')
  assert.equal(next[0].startTime, '09:00')
})

test('strips leftover prior identity after replacing a driver', () => {
  const prior = { name: 'Joan Puig', plate: '1234ABC' }
  const conductors = [
    { id: 'c1', name: 'Pere Vidal', plate: '9999XYZ', startTime: '09:00' },
    { id: 'c2', name: 'Joan Puig', plate: '1234ABC', startTime: '08:00' },
  ]

  assert.equal(
    shouldStripPriorConductorDuplicates({
      isExplicitEdit: true,
      replaced: true,
      priorConductor: prior,
      next: { name: 'Pere Vidal', plate: '9999XYZ' },
    }),
    true
  )

  const next = stripPriorConductorDuplicates(conductors, prior)
  assert.deepEqual(
    next.map((row) => row.id),
    ['c1']
  )
})

test('matches prior identity by name and plate, ignoring accents and plate case', () => {
  assert.equal(
    matchesPriorConductorIdentity(
      { name: 'Joan Puig', plate: '1234abc' },
      { name: 'Joan Púig', plate: '1234ABC' }
    ),
    true
  )
  assert.equal(
    matchesPriorConductorIdentity(
      { name: 'Maria', plate: '1234ABC' },
      { name: 'Joan', plate: '1234ABC' }
    ),
    false
  )
})

test('does not strip on new-row inserts even if priorConductor is present', () => {
  assert.equal(
    shouldStripPriorConductorDuplicates({
      isExplicitEdit: false,
      replaced: false,
      priorConductor: { name: 'Joan', plate: '1234ABC' },
      next: { name: 'Joan', plate: '9999XYZ' },
    }),
    false
  )
})

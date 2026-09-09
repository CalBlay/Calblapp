const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  peFromInputs,
  pctPointsToRatio,
} = require('../src/lib/costServeis/peCalc')

test('PE includes purchases, management, direct fixed and indirect fixed', () => {
  const result = peFromInputs({
    billing: 10000,
    cvOperatiu: 2000,
    pctCompres: 0.3,
    pctGestio: 0.1,
    fixDirecte: 500,
    fixIndirecte: 200,
    numPax: 100,
    mode: 'pots',
  })

  assert.equal(result.preuMitjaPax, 100)
  assert.equal(result.costVariablePerPax, 60)
  assert.equal(result.margePerPax, 40)
  assert.equal(result.fixos, 700)
  assert.equal(result.pePax, 17.5)
  assert.equal(result.peEuro, 1750)
})

test('Opsia percentages are always interpreted as percentage points', () => {
  assert.equal(pctPointsToRatio(33.5), 0.335)
  assert.equal(pctPointsToRatio(1.2), 0.012)
})

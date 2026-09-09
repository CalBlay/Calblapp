const assert = require('node:assert/strict')
const { test } = require('node:test')

const { peFromInputs, pctPointsToRatio, ratioToPctPoints } = require('../src/lib/costServeis/peCalc')
const { peCommercial } = require('../src/lib/costServeis/peCommercial')

test('pctPointsToRatio keeps ratios <= 1.5 and converts percentage points', () => {
  assert.equal(pctPointsToRatio(18.5), 0.185)
  assert.equal(pctPointsToRatio(0.18), 0.18)
  assert.equal(pctPointsToRatio(1.5), 1.5)
  assert.equal(pctPointsToRatio(1.51), 0.0151)
  assert.equal(pctPointsToRatio(0), 0)
  assert.equal(pctPointsToRatio(null), 0)
  assert.equal(pctPointsToRatio(undefined), 0)
  assert.equal(pctPointsToRatio(Number.NaN), 0)
  assert.equal(pctPointsToRatio(-8), 0)
})

test('ratioToPctPoints clamps negatives and rounds to four decimals', () => {
  assert.equal(ratioToPctPoints(0.185), 18.5)
  assert.equal(ratioToPctPoints(0), 0)
  assert.equal(ratioToPctPoints(-1), 0)
})

test('peFromInputs pots mode uses both fixes and excludes % gestió from MC%', () => {
  const result = peFromInputs({
    billing: 10000,
    cvOperatiu: 2000,
    pctCompres: 0.18,
    pctGestio: 0.1,
    fixDirecte: 1000,
    fixIndirecte: 500,
    mode: 'pots',
    numPax: 100,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.pctGestioInFormula, 0)
  assert.equal(result.pctCompresInFormula, 0.18)
  assert.equal(result.cvOperatiuPct, 0.2)
  assert.equal(result.mcPct, 0.62)
  assert.equal(result.fixos, 1500)
  assert.equal(result.preuMitjaPax, 100)
  assert.equal(result.cvOperatiuPerPax, 20)
  assert.equal(result.cvPctPerPax, 18)
  assert.equal(result.costVariablePerPax, 38)
  assert.equal(result.margePerPax, 62)
  assert.equal(result.mcEuro, 6200)
  assert.equal(result.peEuro, 2419.35)
  assert.equal(result.pePax, 24.19)
  assert.equal(result.cobertura, 4.1333)
  assert.equal(result.warnings.length, 0)
})

test('peFromInputs pctGestio mode drops indirect fixos and warns about double counting', () => {
  const result = peFromInputs({
    billing: 10000,
    cvOperatiu: 2000,
    pctCompres: 0.18,
    pctGestio: 0.1,
    fixDirecte: 1000,
    fixIndirecte: 500,
    mode: 'pctGestio',
    numPax: 100,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.pctGestioInFormula, 0.1)
  assert.equal(result.fixos, 1000)
  assert.equal(result.mcPct, 0.52)
  assert.equal(result.peEuro, 1923.08)
  assert.equal(result.pePax, 19.23)
  assert.match(result.warnings[0], /fix indirecte/i)
})

test('peFromInputs uses an explicit preu/pax when billing is missing (what-if)', () => {
  const result = peFromInputs({
    billing: 0,
    cvOperatiu: 2000,
    pctCompres: 0.18,
    pctGestio: 0,
    fixDirecte: 620,
    fixIndirecte: 0,
    mode: 'pots',
    numPax: 100,
    preuMitjaPax: 80,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.preuMitjaPax, 80)
  assert.equal(result.cvOperatiuPerPax, 20)
  assert.equal(result.cvOperatiuPct, null)
  assert.equal(result.mcPct, 0.57)
  assert.equal(result.margePerPax, 45.6)
  assert.equal(result.peEuro, 1087.72)
  assert.equal(result.pePax, 13.6)
})

test('peFromInputs reports no_price, no_margin, and no_fixed instead of inventing a PE', () => {
  const noPrice = peFromInputs({
    billing: 0,
    cvOperatiu: 0,
    pctCompres: 0,
    pctGestio: 0,
    fixDirecte: 100,
    fixIndirecte: 0,
    mode: 'pots',
    numPax: 0,
  })
  assert.equal(noPrice.status, 'no_price')
  assert.equal(noPrice.peEuro, null)
  assert.equal(noPrice.pePax, null)

  const noMargin = peFromInputs({
    billing: 1000,
    cvOperatiu: 900,
    pctCompres: 0.2,
    pctGestio: 0,
    fixDirecte: 100,
    fixIndirecte: 0,
    mode: 'pots',
    numPax: 10,
  })
  assert.equal(noMargin.status, 'no_margin')
  assert.equal(noMargin.mcPct, -0.1)
  assert.equal(noMargin.peEuro, null)
  assert.equal(noMargin.pePax, null)

  const noFixed = peFromInputs({
    billing: 1000,
    cvOperatiu: 100,
    pctCompres: 0,
    pctGestio: 0,
    fixDirecte: 0,
    fixIndirecte: 0,
    mode: 'pots',
    numPax: 10,
  })
  assert.equal(noFixed.status, 'no_fixed')
  assert.equal(noFixed.peEuro, 0)
  assert.equal(noFixed.pePax, 0)
  assert.equal(noFixed.margePerPax, 90)
})

test('peFromInputs clamps negatives and unknown mode to pots', () => {
  const result = peFromInputs({
    billing: -50,
    cvOperatiu: -10,
    pctCompres: -0.2,
    pctGestio: 0.1,
    fixDirecte: -5,
    fixIndirecte: -8,
    mode: 'other',
    numPax: -3,
  })
  assert.equal(result.status, 'no_price')
  assert.equal(result.fixos, 0)
  assert.equal(result.pctCompresInFormula, 0)
  assert.equal(result.pctGestioInFormula, 0)
})

test('peCommercial answers min pax at a price and min price at a pax count', () => {
  const result = peCommercial({
    preuPax: 100,
    pax: 50,
    cvOperatiuPerPax: 20,
    pctCompres: 0.18,
    pctGestio: 0.1,
    fixos: 1500,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.costVariablePerPax, 48)
  assert.equal(result.margePerPax, 52)
  assert.equal(result.mcPct, 0.52)
  assert.equal(result.pePax, 28.85)
  assert.equal(result.peFacturacio, 2885)
  assert.equal(result.preuMinimPax, 69.44)
  assert.match(result.linePreuFix, /29/)
  assert.match(result.linePaxFix, /69/)
})

test('peCommercial reports no_margin and no_fixed without a fake break-even', () => {
  const noMargin = peCommercial({
    preuPax: 30,
    pax: 20,
    cvOperatiuPerPax: 20,
    pctCompres: 0.2,
    pctGestio: 0.2,
    fixos: 500,
  })
  assert.equal(noMargin.status, 'no_margin')
  assert.equal(noMargin.pePax, null)
  assert.equal(noMargin.peFacturacio, null)
  assert.ok(noMargin.preuMinimPax > 30)

  const noFixed = peCommercial({
    preuPax: 80,
    pax: 10,
    cvOperatiuPerPax: 10,
    pctCompres: 0.1,
    pctGestio: 0,
    fixos: 0,
  })
  assert.equal(noFixed.status, 'no_fixed')
  assert.equal(noFixed.pePax, 0)
  assert.equal(noFixed.peFacturacio, 0)
})

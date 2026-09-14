const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildActivityStats,
  buildPotMetrics,
  percentileMedian,
  sumPotMetrics,
} = require('../src/lib/costServeis/monthlyIndicatorMath')

test('monthly cost ratios preserve gross, deductions and net values', () => {
  assert.deepEqual(
    buildPotMetrics({
      grossCost: 10000,
      manualDeductions: 1000,
      eventCount: 50,
      paxCount: 5000,
    }),
    {
      grossCost: 10000,
      manualDeductions: 1000,
      netCost: 9000,
      grossCostPerEvent: 200,
      grossCostPerPax: 2,
      netCostPerEvent: 180,
      netCostPerPax: 1.8,
    }
  )
})

test('monthly cost ratios are null when their denominator is missing', () => {
  const result = buildPotMetrics({
    grossCost: 100,
    manualDeductions: 0,
    eventCount: 0,
    paxCount: 0,
  })
  assert.equal(result.grossCostPerEvent, null)
  assert.equal(result.grossCostPerPax, null)
  assert.equal(result.netCostPerEvent, null)
  assert.equal(result.netCostPerPax, null)
})

test('activity only counts included Empresa and Casaments facts', () => {
  const activity = buildActivityStats([
    { included: true, lnNormalized: 'Empresa', numPax: 100, hasValidPax: true },
    { included: true, lnNormalized: 'Casaments', numPax: 200, hasValidPax: true },
    { included: true, lnNormalized: 'Empresa', numPax: 0, hasValidPax: false },
    { included: false, lnNormalized: 'Foodlovers', numPax: 50, hasValidPax: true },
  ])
  assert.equal(activity.eventCount, 3)
  assert.equal(activity.paxCount, 300)
  assert.equal(activity.empresaEvents, 2)
  assert.equal(activity.casamentsEvents, 1)
  assert.equal(activity.missingPaxEvents, 1)
  assert.equal(activity.excludedEvents, 1)
  assert.equal(activity.averagePax, 150)
  assert.equal(activity.medianPax, 150)
})

test('total metrics combine all three pots without duplicating denominators', () => {
  const pot = (grossCost) =>
    buildPotMetrics({ grossCost, manualDeductions: 0, eventCount: 10, paxCount: 100 })
  const total = sumPotMetrics(
    { gestio: pot(100), preparacio: pot(200), rentat: pot(300) },
    10,
    100
  )
  assert.equal(total.netCost, 600)
  assert.equal(total.netCostPerEvent, 60)
  assert.equal(total.netCostPerPax, 6)
  assert.equal(percentileMedian([30, 10, 20]), 20)
})

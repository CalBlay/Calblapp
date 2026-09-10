const assert = require('node:assert/strict')
const { test } = require('node:test')

const { metricsFromParts } = require('../src/lib/costServeis/resultatsAggregate')
const {
  allocateCostPool,
  calculateIndirectPersonnelPool,
} = require('../src/lib/costServeis/fixedCostMath')

test('indirect personnel subtracts direct and logistics/kitchen from the Opsia LN total', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 339888.5,
      fixedDirect: 41251.58,
      logisticsKitchen: 224971.9,
    }),
    73665.02
  )
})

test('indirect personnel is unavailable when Opsia does not provide the LN total', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: null,
      fixedDirect: 41251.58,
      logisticsKitchen: 224971.9,
    }),
    null
  )
})

test('residual indirect personnel floors at zero instead of going negative', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 100,
      fixedDirect: 80,
      logisticsKitchen: 50,
    }),
    0
  )
})

test('residual indirect personnel is unavailable without the LN total and the direct base', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 100,
      fixedDirect: null,
      logisticsKitchen: 10,
    }),
    null
  )
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: Number.NaN,
      fixedDirect: 10,
      logisticsKitchen: 10,
    }),
    null
  )
})

test('FIX_DEPARTAMENTS without a configured amount is unavailable and negatives clamp to 0', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 999,
      fixedDirect: 10,
      logisticsKitchen: 10,
      mode: 'FIX_DEPARTAMENTS',
      configuredFixed: null,
    }),
    null
  )
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 999,
      fixedDirect: 10,
      logisticsKitchen: 10,
      mode: 'FIX_DEPARTAMENTS',
      configuredFixed: -25,
    }),
    0
  )
})

test('configured monthly fixed amounts from Opsia are exported unchanged', () => {
  for (const configuredFixed of [20000, 15000, 5000]) {
    assert.equal(
      calculateIndirectPersonnelPool({
        personalTotalLn: 999999,
        fixedDirect: 367053.66,
        logisticsKitchen: 9230.77,
        mode: 'FIX_DEPARTAMENTS',
        configuredFixed,
      }),
      configuredFixed
    )
  }
})

test('cost pool remainder stays on the last eligible row and ineligible drivers get 0', () => {
  const events = [
    { id: 'skip', billing: 0 },
    { id: 'a', billing: 1 },
    { id: 'b', billing: 1 },
    { id: 'c', billing: 1 },
  ]
  const result = allocateCostPool(events, 10, (row) => row.billing)

  assert.equal(result.get(events[0]), 0)
  assert.equal(result.get(events[1]), 3.33)
  assert.equal(result.get(events[2]), 3.33)
  assert.equal(result.get(events[3]), 3.34)
  assert.equal([...result.values()].reduce((sum, value) => sum + value, 0), 10)
})

test('empty or non-positive pools allocate zero to every row', () => {
  const events = [{ id: 'a', billing: 10 }]
  assert.equal(allocateCostPool(events, 0, (row) => row.billing).get(events[0]), 0)
  assert.equal(allocateCostPool(events, -50, (row) => row.billing).get(events[0]), 0)
  assert.equal(allocateCostPool([], 100, () => 1).size, 0)
})

test('indirect pool is shared by every event, including zero billing', () => {
  const events = [
    { id: 'a', billing: 100 },
    { id: 'b', billing: 0 },
    { id: 'c' },
  ]
  const result = allocateCostPool(events, 100, () => 1)

  assert.equal(result.get(events[0]), 33.33)
  assert.equal(result.get(events[1]), 33.33)
  assert.equal(result.get(events[2]), 33.34)
  assert.equal([...result.values()].reduce((sum, value) => sum + value, 0), 100)
})

test('resultats exposes every cost layer and the pots consolidation', () => {
  const row = metricsFromParts({
    eventCount: 1,
    numPax: 100,
    billing: 1000,
    operationalCost: 300,
    theoreticalPurchaseCost: 200,
    theoreticalManagementCost: 100,
    fixedDirect: 80,
    fixedIndirect: 70,
    fixedDirectNormalized: 60,
    fixedIndirectNormalized: 50,
  })

  assert.equal(row.contributionMargin, 700)
  assert.equal(row.marginAfterDirect, 620)
  assert.equal(row.potsFullCost, 750)
  assert.equal(row.potsFullMargin, 250)
  assert.equal(row.potsFullMarginPct, 0.25)
  assert.equal(row.normalizedPotsFullCost, 710)
  assert.equal(row.normalizedPotsFullMargin, 290)
})

test('management cost and fixed indirect personnel coexist in the consolidation', () => {
  const row = metricsFromParts({
    eventCount: 1,
    numPax: 0,
    billing: 1000,
    operationalCost: 300,
    theoreticalPurchaseCost: 200,
    theoreticalManagementCost: 100,
    fixedDirect: 80,
    fixedIndirect: 70,
    fixedDirectNormalized: 0,
    fixedIndirectNormalized: 0,
  })

  assert.equal(row.managementFullCost, 750)
  assert.equal(row.managementFullMargin, 250)
  assert.equal(row.managementFullMarginPct, 0.25)
})

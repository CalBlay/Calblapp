const assert = require('node:assert/strict')
const { test } = require('node:test')

const { metricsFromParts } = require('../src/lib/costServeis/resultatsAggregate')
const {
  allocateCostPool,
  calculateIndirectPersonnelPool,
} = require('../src/lib/costServeis/fixedCostMath')

test('indirect personnel subtracts direct and confirmed operational transfers', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: 339888.5,
      fixedDirect: 41251.58,
      operationalDirectTransfers: 555.45,
    }),
    298081.47
  )
})

test('indirect personnel is unavailable when Opsia does not provide the LN total', () => {
  assert.equal(
    calculateIndirectPersonnelPool({
      personalTotalLn: null,
      fixedDirect: 41251.58,
      operationalDirectTransfers: 555.45,
    }),
    null
  )
})

test('configured monthly fixed amounts from Opsia are exported unchanged', () => {
  for (const configuredFixed of [20000, 15000, 5000]) {
    assert.equal(
      calculateIndirectPersonnelPool({
        personalTotalLn: 999999,
        fixedDirect: 367053.66,
        operationalDirectTransfers: null,
        mode: 'FIX_DEPARTAMENTS',
        configuredFixed,
      }),
      configuredFixed
    )
  }
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

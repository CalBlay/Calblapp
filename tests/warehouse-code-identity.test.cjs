const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  isPreparationWarehouseCode,
  normalizePreparationWarehouseCode,
  PREPARATION_WAREHOUSE_CODES,
} = require('../src/lib/logistics/preparationWarehouses')
const {
  normalizeWarehouseCode,
  warehouseDocId,
} = require('../src/lib/eventComanda/warehouseIds')
const {
  isPreparationLineComplete,
  normalizePreparationWarehouseMap,
  preparationLinePct,
} = require('../src/lib/logistics/preparationMagatzem')

function completedAt(warehouses) {
  return Object.fromEntries(
    warehouses.map((warehouse) => [
      warehouse,
      { userId: 'test', userName: 'Test', at: '2026-11-26T13:00:00.000Z' },
    ])
  )
}

test('isPreparationWarehouseCode accepts all required preparation warehouse literals', () => {
  assert.deepEqual(
    [...PREPARATION_WAREHOUSE_CODES],
    ['BODEGA', 'PARAMENT', 'MATERIAL', 'DECO', 'MOBILIARI']
  )
  for (const code of PREPARATION_WAREHOUSE_CODES) {
    assert.equal(isPreparationWarehouseCode(code), true)
  }
  assert.equal(isPreparationWarehouseCode('bodega'), false)
  assert.equal(isPreparationWarehouseCode('BODEGA '), false)
  assert.equal(isPreparationWarehouseCode('CUINA'), false)
  assert.equal(isPreparationWarehouseCode(''), false)
})

test('normalizePreparationWarehouseCode trims and uppercases before validating', () => {
  assert.equal(normalizePreparationWarehouseCode(' bodega '), 'BODEGA')
  assert.equal(normalizePreparationWarehouseCode('Parament'), 'PARAMENT')
  assert.equal(normalizePreparationWarehouseCode('material'), 'MATERIAL')
  assert.equal(normalizePreparationWarehouseCode('deco'), 'DECO')
  assert.equal(normalizePreparationWarehouseCode(' mobiliari '), 'MOBILIARI')
  assert.equal(normalizePreparationWarehouseCode('cuina'), null)
  assert.equal(normalizePreparationWarehouseCode(''), null)
  assert.equal(normalizePreparationWarehouseCode(null), null)
})

test('the five required warehouses contribute 20% each and Mobiliari is required for 100%', () => {
  assert.equal(preparationLinePct(completedAt(['BODEGA'])), 20)
  assert.equal(
    preparationLinePct(completedAt(['BODEGA', 'PARAMENT', 'MATERIAL', 'DECO'])),
    80
  )
  assert.equal(
    isPreparationLineComplete(completedAt(['BODEGA', 'PARAMENT', 'MATERIAL', 'DECO'])),
    false
  )
  assert.equal(preparationLinePct(completedAt(PREPARATION_WAREHOUSE_CODES)), 100)
  assert.equal(isPreparationLineComplete(completedAt(PREPARATION_WAREHOUSE_CODES)), true)
})

test('No aplica resolves a warehouse for progress and preserves its audit reason', () => {
  const map = normalizePreparationWarehouseMap({
    ...completedAt(['BODEGA', 'PARAMENT', 'MATERIAL', 'DECO']),
    MOBILIARI: {
      userId: 'supervisor',
      userName: 'Supervisor',
      at: '2026-11-26T13:05:00.000Z',
      status: 'not_applicable',
      reason: 'Aquest servei no porta mobiliari',
    },
  })

  assert.equal(map.MOBILIARI.status, 'not_applicable')
  assert.equal(map.MOBILIARI.reason, 'Aquest servei no porta mobiliari')
  assert.equal(preparationLinePct(map), 100)
  assert.equal(isPreparationLineComplete(map), true)
})

test('warehouseDocId strips separators so Firestore ids stay uppercase alnum', () => {
  assert.equal(warehouseDocId(' bodega-1 '), 'BODEGA1')
  assert.equal(normalizeWarehouseCode('WH_A'), 'WHA')
  assert.equal(warehouseDocId(''), '')
})

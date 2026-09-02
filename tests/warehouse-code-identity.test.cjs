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

test('isPreparationWarehouseCode accepts only the three logistics warehouse literals', () => {
  assert.deepEqual([...PREPARATION_WAREHOUSE_CODES], ['BODEGA', 'PARAMENT', 'MATERIAL'])
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
  assert.equal(normalizePreparationWarehouseCode('cuina'), null)
  assert.equal(normalizePreparationWarehouseCode(''), null)
  assert.equal(normalizePreparationWarehouseCode(null), null)
})

test('warehouseDocId strips separators so Firestore ids stay uppercase alnum', () => {
  assert.equal(warehouseDocId(' bodega-1 '), 'BODEGA1')
  assert.equal(normalizeWarehouseCode('WH_A'), 'WHA')
  assert.equal(warehouseDocId(''), '')
})

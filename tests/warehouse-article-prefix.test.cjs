const assert = require('node:assert/strict')
const Module = require('node:module')
const { after, test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  resolveWarehouseIdForArticleCode,
  warehouseRuleDocId,
} = require('../src/lib/eventComanda/warehouseRules.server')
const {
  normalizeWarehouseCode,
  warehouseDocId,
} = require('../src/lib/eventComanda/warehouseIds')

after(() => {
  Module._load = originalLoad
})

const rule = (prefix, warehouseId) => ({
  id: prefix,
  prefix,
  warehouseId,
  createdAt: 0,
  updatedAt: 0,
})

test('resolveWarehouseIdForArticleCode prefers the longest matching prefix', () => {
  const rules = [rule('09', 'BODEGA'), rule('09V', 'VINS'), rule('LC', 'LACTICS')]

  assert.equal(resolveWarehouseIdForArticleCode('09VINS', rules), 'VINS')
  assert.equal(resolveWarehouseIdForArticleCode('09pae', rules), 'BODEGA')
  assert.equal(resolveWarehouseIdForArticleCode('LC001', rules), 'LACTICS')
  assert.equal(resolveWarehouseIdForArticleCode('xx001', rules), null)
  assert.equal(resolveWarehouseIdForArticleCode('  ', rules), null)
  assert.equal(resolveWarehouseIdForArticleCode('09VINS', []), null)
})

test('warehouseRuleDocId and warehouse codes strip punctuation and case', () => {
  assert.equal(warehouseRuleDocId(' 09-v '), '09V')
  assert.equal(normalizeWarehouseCode(' bodega-1 '), 'BODEGA1')
  assert.equal(warehouseDocId('Parament!'), 'PARAMENT')
  assert.equal(normalizeWarehouseCode(''), '')
})

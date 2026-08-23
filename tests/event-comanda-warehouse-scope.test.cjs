const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { firestoreAdmin: {} }
  }
  if (
    request === '@/lib/server/apiAuth' ||
    /[\\/]src[\\/]lib[\\/]server[\\/]apiAuth\.(ts|js|cjs|mjs)$/.test(request)
  ) {
    return { requireAuth: async () => ({ ok: false }), requireRoles: () => null }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { warehouseDocId, normalizeWarehouseCode } = require('../src/lib/eventComanda/warehouseIds')
const { resolveWarehouseIdForArticleCode, warehouseRuleDocId } = require(
  '../src/lib/eventComanda/warehouseRules.server'
)
const {
  canViewAllEventComandaWarehouses,
  filterOrderBatchesForUser,
  filterBatchesForPreparerView,
  filterBatchesForPreparerHistoryView,
  batchIsVisibleToPreparer,
} = require('../src/lib/eventComanda/warehouseMembers.server')

function batch(warehouseId, status, lineCount = 1) {
  return {
    warehouseId,
    warehouseCode: warehouseId,
    warehouseName: warehouseId,
    status,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      articleCode: `A${i}`,
      articleName: `Art ${i}`,
      family: 'F',
      qtyRequested: 1,
    })),
  }
}

test('warehouseDocId and rule ids compact to uppercase alnum', () => {
  assert.equal(warehouseDocId(' mag-1 '), 'MAG1')
  assert.equal(normalizeWarehouseCode('bodega'), 'BODEGA')
  assert.equal(warehouseDocId(''), '')
  assert.equal(warehouseRuleDocId(' 09-a '), '09A')
  assert.equal(warehouseRuleDocId('09'), '09')
})

test('resolveWarehouseIdForArticleCode prefers the longest matching prefix', () => {
  const rules = [
    { id: '09', prefix: '09', warehouseId: 'MAG', createdAt: 0, updatedAt: 0 },
    { id: '09A', prefix: '09A', warehouseId: 'FRED', createdAt: 0, updatedAt: 0 },
    { id: '12', prefix: '12', warehouseId: 'SEC', createdAt: 0, updatedAt: 0 },
  ]
  assert.equal(resolveWarehouseIdForArticleCode('09A123', rules), 'FRED')
  assert.equal(resolveWarehouseIdForArticleCode('09-999', rules), 'MAG')
  assert.equal(resolveWarehouseIdForArticleCode('12B', rules), 'SEC')
  assert.equal(resolveWarehouseIdForArticleCode('99', rules), null)
  assert.equal(resolveWarehouseIdForArticleCode('', rules), null)
  assert.equal(resolveWarehouseIdForArticleCode('  09a1 ', rules), 'FRED')
})

test('canViewAllEventComandaWarehouses is exact admin/direccio after lowercasing only', () => {
  assert.equal(canViewAllEventComandaWarehouses('admin'), true)
  assert.equal(canViewAllEventComandaWarehouses('Admin'), true)
  assert.equal(canViewAllEventComandaWarehouses('direccio'), true)
  assert.equal(canViewAllEventComandaWarehouses('Direccio'), true)
  assert.equal(canViewAllEventComandaWarehouses('Direcció'), false)
  assert.equal(canViewAllEventComandaWarehouses('cap'), false)
  assert.equal(canViewAllEventComandaWarehouses(''), false)
  assert.equal(canViewAllEventComandaWarehouses(null), false)
})

test('filterOrderBatchesForUser scopes assigned warehouses and leaves admins unfiltered', () => {
  const bodega = batch('BODEGA', 'pending')
  const parament = batch('PARAMENT', 'pending')
  const batches = [bodega, parament]

  assert.equal(filterOrderBatchesForUser(undefined, { userId: 'u1', assignedWarehouseIds: [] }), undefined)
  assert.deepEqual(filterOrderBatchesForUser([], { userId: 'u1', assignedWarehouseIds: ['BODEGA'] }), [])

  assert.deepEqual(
    filterOrderBatchesForUser(batches, {
      userId: 'u1',
      role: 'admin',
      assignedWarehouseIds: ['BODEGA'],
    }),
    batches
  )

  // No assignments → helper does not hide batches (caller treats empty as unscoped).
  assert.deepEqual(
    filterOrderBatchesForUser(batches, {
      userId: 'u1',
      role: 'treballador',
      assignedWarehouseIds: [],
    }),
    batches
  )

  assert.deepEqual(
    filterOrderBatchesForUser(batches, {
      userId: 'u1',
      role: 'treballador',
      assignedWarehouseIds: [' bodega '],
    }),
    [bodega]
  )

  assert.deepEqual(
    filterOrderBatchesForUser(batches, {
      userId: 'u1',
      role: 'treballador',
      assignedWarehouseIds: ['UNKNOWN'],
    }),
    []
  )
})

test('filterBatchesForPreparerView hides sent/cancelled and empty-line lots', () => {
  const visible = batch('BODEGA', 'in_progress')
  const ready = batch('BODEGA', 'ready')
  const sent = batch('BODEGA', 'sent')
  const cancelled = batch('BODEGA', 'cancelled')
  const empty = batch('BODEGA', 'pending', 0)

  assert.deepEqual(
    filterBatchesForPreparerView([visible, ready, sent, cancelled, empty], {
      userId: 'u1',
      role: 'admin',
      assignedWarehouseIds: [],
    }),
    [visible, ready]
  )
  assert.equal(batchIsVisibleToPreparer(visible), true)
  assert.equal(batchIsVisibleToPreparer(sent), false)
  assert.equal(batchIsVisibleToPreparer(empty), false)
})

test('filterBatchesForPreparerHistoryView keeps only sent lots with lines', () => {
  const sent = batch('BODEGA', 'sent')
  const pending = batch('BODEGA', 'pending')
  const sentEmpty = batch('BODEGA', 'sent', 0)

  assert.deepEqual(
    filterBatchesForPreparerHistoryView([sent, pending, sentEmpty], {
      userId: 'u1',
      role: 'admin',
      assignedWarehouseIds: [],
    }),
    [sent]
  )
})

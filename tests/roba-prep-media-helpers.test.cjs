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
  return originalLoad.call(this, request, parent, isMain)
}

const { joinRecipientEmails } = require('../src/lib/roba-personal/purchaseRecipient')
const { slugifyWorkerCodeBase } = require('../src/lib/roba-personal/workerCodeFormat')
const {
  requestReferenceFromDocId,
  robaRequestDocIdFromInput,
} = require('../src/lib/roba-personal/dotacioReferenceCodes')
const {
  avgDailyFromSemesterTotal,
  daysUntilMinimum,
  suggestedSemesterOrderQty,
} = require('../src/lib/roba-personal/deliveryConsumption')
const { workerSelfCanCancelRobaRequest } = require('../src/lib/roba-personal/requestPermissions')
const { isReversibleManualStockReason } = require('../src/lib/roba-personal/stockMovementLabels')
const { isLikelyImageFile } = require('../src/lib/media/isLikelyImageFile')
const {
  listAllowedPreparationWarehouses,
  canMarkPreparationWarehouse,
} = require('../src/lib/logistics/preparationPermissions')
const {
  normalizePreparationWarehouseCode,
  PREPARATION_WAREHOUSE_CODES,
} = require('../src/lib/logistics/preparationWarehouses')

test('joinRecipientEmails drops empty addresses and dedupes', () => {
  assert.equal(
    joinRecipientEmails([
      { id: '1', name: 'A', email: 'a@calblay.com', department: 'compres' },
      { id: '2', name: 'B', email: null, department: 'compres' },
      { id: '3', name: 'C', email: '', department: 'compres' },
      { id: '4', name: 'D', email: 'a@calblay.com', department: 'compres' },
      { id: '5', name: 'E', email: 'e@calblay.com', department: 'compres' },
    ]),
    'a@calblay.com, e@calblay.com'
  )
  assert.equal(joinRecipientEmails([]), '')
})

test('slugifyWorkerCodeBase folds accents and collapses separators', () => {
  assert.equal(slugifyWorkerCodeBase('  Núria  Pérez  '), 'nuria-perez')
  assert.equal(slugifyWorkerCodeBase('Joan--Maria!!'), 'joan-maria')
  assert.equal(slugifyWorkerCodeBase('---'), '')
  assert.equal(slugifyWorkerCodeBase(''), '')
})

test('robaRequestDocIdFromInput accepts raw ids and S- references', () => {
  assert.equal(requestReferenceFromDocId('abc'), 'S-abc')
  assert.equal(robaRequestDocIdFromInput('S-abc'), 'abc')
  assert.equal(robaRequestDocIdFromInput('s-XYZ'), 'XYZ')
  assert.equal(robaRequestDocIdFromInput('  abc  '), 'abc')
  assert.equal(robaRequestDocIdFromInput(''), '')
  // Bare "S-" does not match S-(.+) so it is treated as a raw document id.
  assert.equal(robaRequestDocIdFromInput('S-'), 'S-')
})

test('purchase suggestion math covers shortfall, no-consumption, and already-below-min', () => {
  assert.equal(avgDailyFromSemesterTotal(180, 180), 1)
  assert.equal(avgDailyFromSemesterTotal(10, 0), 0)
  assert.equal(daysUntilMinimum(20, 10, 2), 5)
  assert.equal(daysUntilMinimum(8, 10, 2), 0)
  assert.equal(daysUntilMinimum(20, 10, 0), null)
  assert.equal(daysUntilMinimum(8, 10, 0), 0)
  assert.equal(suggestedSemesterOrderQty(4, 10, 6), 12)
  assert.equal(suggestedSemesterOrderQty(20, 10, 3.1), 4)
  assert.equal(suggestedSemesterOrderQty(10, 10, 0), 0)
})

test('workerSelfCanCancelRobaRequest is owner-or-linked worker and submitted only', () => {
  assert.equal(
    workerSelfCanCancelRobaRequest({
      linkedPersonnelId: 'p1',
      userId: 'u1',
      request: { status: 'submitted', createdByUserId: 'u1' },
    }),
    true
  )
  assert.equal(
    workerSelfCanCancelRobaRequest({
      linkedPersonnelId: 'p1',
      userId: 'u-other',
      request: { status: 'submitted', requestedByWorkerId: 'p1' },
    }),
    true
  )
  assert.equal(
    workerSelfCanCancelRobaRequest({
      linkedPersonnelId: 'p1',
      userId: 'u1',
      request: { status: 'prepared', createdByUserId: 'u1' },
    }),
    false
  )
  assert.equal(
    workerSelfCanCancelRobaRequest({
      linkedPersonnelId: '',
      userId: 'u1',
      request: { requestedByWorkerId: '' },
    }),
    false
  )
  assert.equal(
    workerSelfCanCancelRobaRequest({
      linkedPersonnelId: 'p1',
      userId: 'u1',
      request: { requestedByWorkerId: 'p1' },
    }),
    true
  )
})

test('isReversibleManualStockReason treats blank reason as manual', () => {
  assert.equal(isReversibleManualStockReason('manual_adjust'), true)
  assert.equal(isReversibleManualStockReason('manual_purchase'), true)
  assert.equal(isReversibleManualStockReason(null), true)
  assert.equal(isReversibleManualStockReason(''), true)
  assert.equal(isReversibleManualStockReason('delivery'), false)
  assert.equal(isReversibleManualStockReason('request_reserve'), false)
})

test('isLikelyImageFile accepts image MIME or common extensions when type is empty', () => {
  assert.equal(isLikelyImageFile(null), false)
  assert.equal(isLikelyImageFile({ type: 'image/jpeg', name: 'x.bin' }), true)
  assert.equal(isLikelyImageFile({ type: '', name: 'photo.HEIC' }), true)
  assert.equal(isLikelyImageFile({ type: '', name: 'scan.tiff' }), true)
  assert.equal(isLikelyImageFile({ type: 'video/mp4', name: 'clip.mp4' }), false)
  assert.equal(isLikelyImageFile({ type: '', name: 'notes.pdf' }), false)
  assert.equal(isLikelyImageFile({ type: '', name: 'photo.jpg.exe' }), false)
})

test('listAllowedPreparationWarehouses grants managers all codes and workers only explicit actions', () => {
  assert.deepEqual(listAllowedPreparationWarehouses({ role: 'admin' }), [
    ...PREPARATION_WAREHOUSE_CODES,
  ])
  assert.deepEqual(listAllowedPreparationWarehouses({ role: 'Direccio' }), [
    ...PREPARATION_WAREHOUSE_CODES,
  ])
  assert.deepEqual(listAllowedPreparationWarehouses({ role: 'cap' }), [
    ...PREPARATION_WAREHOUSE_CODES,
  ])
  assert.deepEqual(
    listAllowedPreparationWarehouses({
      role: 'treballador',
      actions: {
        'ui:action:/menu/logistica/preparacio:warehouse:BODEGA': true,
        'ui:action:/menu/logistica/preparacio:warehouse:PARAMENT': false,
      },
    }),
    ['BODEGA']
  )
  assert.equal(
    canMarkPreparationWarehouse({
      role: 'treballador',
      warehouse: 'MATERIAL',
      actions: { 'ui:action:/menu/logistica/preparacio:warehouse:MATERIAL': true },
    }),
    true
  )
  assert.equal(
    canMarkPreparationWarehouse({
      role: 'treballador',
      warehouse: 'MATERIAL',
      actions: {},
    }),
    false
  )
  assert.equal(normalizePreparationWarehouseCode(' bodega '), 'BODEGA')
  assert.equal(normalizePreparationWarehouseCode('unknown'), null)
})

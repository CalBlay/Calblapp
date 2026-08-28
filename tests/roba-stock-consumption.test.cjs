const assert = require('node:assert/strict')
const Module = require('node:module')
const { test, after } = require('node:test')

function isFirebaseAdminModule(request) {
  return (
    request === '@/lib/firebaseAdmin' ||
    /[\\/]src[\\/]lib[\\/]firebaseAdmin\.(ts|js|cjs|mjs)$/.test(request)
  )
}

const originalLoad = Module._load
Module._load = function loadWithStubs(request, parent, isMain) {
  if (request === 'server-only') return {}
  if (isFirebaseAdminModule(request)) {
    return { firestoreAdmin: { collection: () => ({}) } }
  }
  return originalLoad.call(this, request, parent, isMain)
}

after(() => {
  Module._load = originalLoad
})

const {
  isReversibleManualStockReason,
  labelStockMovementReason,
  labelStockMovementReasonDisplay,
  stockMovementReservaLabel,
  stockMovementDepartmentLabel,
} = require('../src/lib/roba-personal/stockMovementLabels')
const {
  parseDeliveryReferenceFromMovementNotes,
} = require('../src/lib/roba-personal/stockMovementsEnrich')
const {
  avgDailyFromSemesterTotal,
  daysUntilMinimum,
  suggestedSemesterOrderQty,
} = require('../src/lib/roba-personal/deliveryConsumption')

test('isReversibleManualStockReason treats empty/null as manual', () => {
  assert.equal(isReversibleManualStockReason(undefined), true)
  assert.equal(isReversibleManualStockReason(null), true)
  assert.equal(isReversibleManualStockReason(''), true)
  assert.equal(isReversibleManualStockReason('manual_return'), true)
  assert.equal(isReversibleManualStockReason('delivery'), false)
  assert.equal(isReversibleManualStockReason('request_reserve'), false)
})

test('labelStockMovementReasonDisplay special-cases pending worker ack', () => {
  assert.equal(labelStockMovementReason(undefined), '—')
  assert.equal(labelStockMovementReason('manual_purchase'), 'Compra / entrada')
  assert.equal(labelStockMovementReason('custom_reason'), 'custom_reason')
  assert.equal(
    labelStockMovementReasonDisplay({
      reason: 'delivery',
      deliveryWorkerAckPending: true,
    }),
    'Entrega pel responsable (pendent recepció treballador)'
  )
  assert.equal(
    labelStockMovementReasonDisplay({ reason: 'delivery' }),
    'Entrega a treballador'
  )
})

test('stock movement reserva and department labels fall back to em dash', () => {
  assert.equal(stockMovementReservaLabel({ quantityReservedDelta: 3 }), '+3 res.')
  assert.equal(stockMovementReservaLabel({ quantityReservedDelta: -2 }), '-2 res.')
  assert.equal(
    stockMovementReservaLabel({ quantityReservedDelta: 0, productReservedAfter: 4 }),
    '4 u. res.'
  )
  assert.equal(stockMovementReservaLabel({}), '—')
  assert.equal(
    stockMovementDepartmentLabel({ requestingDepartment: 'Cuina' }),
    'Cuina'
  )
  assert.equal(stockMovementDepartmentLabel({ workerDepartment: 'Sala' }), 'Sala')
  assert.equal(stockMovementDepartmentLabel({}), '—')
})

test('parseDeliveryReferenceFromMovementNotes reads E- refs from legacy notes', () => {
  assert.equal(
    parseDeliveryReferenceFromMovementNotes('Entrega E-del_99 — pantalons'),
    'E-del_99'
  )
  assert.equal(
    parseDeliveryReferenceFromMovementNotes('Eliminació entrega E-gone'),
    'E-gone'
  )
  assert.equal(
    parseDeliveryReferenceFromMovementNotes('Eliminacio entrega E-gone2'),
    'E-gone2'
  )
  assert.equal(parseDeliveryReferenceFromMovementNotes('sense ref'), null)
  assert.equal(parseDeliveryReferenceFromMovementNotes(''), null)
})

test('daysUntilMinimum returns 0 at/below min and null without consumption', () => {
  assert.equal(daysUntilMinimum(100, 20, 10), 8)
  assert.equal(daysUntilMinimum(20, 20, 10), 0)
  assert.equal(daysUntilMinimum(10, 20, 10), 0)
  assert.equal(daysUntilMinimum(100, 20, 0), null)
  assert.equal(daysUntilMinimum(10, 20, 0), 0)
})

test('suggestedSemesterOrderQty covers shortfall plus last-semester volume', () => {
  assert.equal(avgDailyFromSemesterTotal(180, 180), 1)
  assert.equal(avgDailyFromSemesterTotal(10, 0), 0)
  assert.equal(suggestedSemesterOrderQty(50, 80, 10), 40)
  assert.equal(suggestedSemesterOrderQty(100, 80, 10.2), 11)
  assert.equal(suggestedSemesterOrderQty(80, 80, 0), 0)
})

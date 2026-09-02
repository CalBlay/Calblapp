const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  addIsoDays,
  deliveryDateRangeForPrepViewWindow,
  listWarehousePrepViewDaysForDelivery,
  resolveWarehousePrepViewRole,
  warehousePrepSlotSortKey,
  warehousePrepSlotStartHour,
  warehousePrepStatusSortKey,
  WAREHOUSE_PREP_LEAD_DAYS,
} = require('../src/lib/logistics/warehousePrepVisibility')
const {
  isPreparationWarehouseCode,
  normalizePreparationWarehouseCode,
} = require('../src/lib/logistics/preparationWarehouses')
const { isIsoDateDayParam } = require('../src/lib/firestoreStageRangeQuery')

test('resolveWarehousePrepViewRole maps D / D-1 / D-2 and rejects days outside the lead window', () => {
  assert.equal(WAREHOUSE_PREP_LEAD_DAYS, 2)
  assert.equal(resolveWarehousePrepViewRole('2026-08-29', '2026-08-29'), 'delivery_today')
  assert.equal(resolveWarehousePrepViewRole('2026-08-28', '2026-08-29'), 'prep_tomorrow')
  assert.equal(resolveWarehousePrepViewRole('2026-08-27', '2026-08-29'), 'early_prep')
  assert.equal(resolveWarehousePrepViewRole('2026-08-26', '2026-08-29'), null)
  assert.equal(resolveWarehousePrepViewRole('2026-08-30', '2026-08-29'), null)
  assert.equal(
    resolveWarehousePrepViewRole('2026-08-28T18:00:00.000Z', '2026-08-29T09:00:00Z'),
    'prep_tomorrow'
  )
  assert.equal(resolveWarehousePrepViewRole('nope', '2026-08-29'), null)
  assert.equal(resolveWarehousePrepViewRole('2026-08-29', ''), null)
})

test('addIsoDays wraps month and year boundaries and rejects unparsable keys', () => {
  assert.equal(addIsoDays('2026-03-01', -1), '2026-02-28')
  assert.equal(addIsoDays('2026-01-01', -1), '2025-12-31')
  assert.equal(addIsoDays('2026-08-29', 2), '2026-08-31')
  assert.equal(addIsoDays('not-a-date', 1), null)
})

test('listWarehousePrepViewDaysForDelivery clips the D-2..D window to the requested range', () => {
  assert.deepEqual(
    listWarehousePrepViewDaysForDelivery({
      deliveryDate: '2026-08-29',
      rangeStart: '2026-08-27',
      rangeEnd: '2026-08-28',
    }),
    [
      { viewDay: '2026-08-27', viewRole: 'early_prep' },
      { viewDay: '2026-08-28', viewRole: 'prep_tomorrow' },
    ]
  )

  assert.deepEqual(
    listWarehousePrepViewDaysForDelivery({
      deliveryDate: '2026-08-29',
      rangeStart: '2026-08-29',
      rangeEnd: '2026-08-29',
    }),
    [{ viewDay: '2026-08-29', viewRole: 'delivery_today' }]
  )

  assert.deepEqual(
    listWarehousePrepViewDaysForDelivery({
      deliveryDate: 'bad',
      rangeStart: '2026-08-27',
      rangeEnd: '2026-08-29',
    }),
    []
  )
})

test('deliveryDateRangeForPrepViewWindow extends the end by the lead days so D-2 rows stay queryable', () => {
  assert.deepEqual(deliveryDateRangeForPrepViewWindow('2026-08-27', '2026-08-29'), {
    deliveryStart: '2026-08-27',
    deliveryEnd: '2026-08-31',
  })
  assert.deepEqual(deliveryDateRangeForPrepViewWindow('nope', '2026-08-29'), {
    deliveryStart: '',
    deliveryEnd: '',
  })
})

test('warehouse prep slot and status sort keys keep known values ahead of unknowns', () => {
  assert.equal(warehousePrepSlotSortKey('mati'), 0)
  assert.equal(warehousePrepSlotSortKey(' VESPRE '), 3)
  assert.equal(warehousePrepSlotSortKey('nit'), 99)
  assert.equal(warehousePrepSlotSortKey(null), 99)
  assert.equal(warehousePrepSlotStartHour('mati'), 8)
  assert.equal(warehousePrepSlotStartHour('vespre'), 18)
  assert.equal(warehousePrepSlotStartHour('x'), 99)
  assert.equal(warehousePrepStatusSortKey('issue'), 0)
  assert.equal(warehousePrepStatusSortKey('cancelled'), 5)
  assert.equal(warehousePrepStatusSortKey('unknown'), 99)
})

test('normalizePreparationWarehouseCode only accepts Bodega / Parament / Material', () => {
  assert.equal(normalizePreparationWarehouseCode(' bodega '), 'BODEGA')
  assert.equal(normalizePreparationWarehouseCode('PARAMENT'), 'PARAMENT')
  assert.equal(normalizePreparationWarehouseCode('cuina'), null)
  assert.equal(isPreparationWarehouseCode('MATERIAL'), true)
  assert.equal(isPreparationWarehouseCode('material'), false)
})

test('isIsoDateDayParam accepts YYYY-MM-DD even when a datetime suffix is present', () => {
  assert.equal(isIsoDateDayParam('2026-08-29'), true)
  assert.equal(isIsoDateDayParam('2026-08-29T10:00:00Z'), true)
  assert.equal(isIsoDateDayParam('2026-8-29'), false)
  assert.equal(isIsoDateDayParam('29-08-2026'), false)
  assert.equal(isIsoDateDayParam(''), false)
})

const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  WAREHOUSE_PREP_LEAD_DAYS,
  addIsoDays,
  resolveWarehousePrepViewRole,
  listWarehousePrepViewDaysForDelivery,
  deliveryDateRangeForPrepViewWindow,
  warehousePrepSlotSortKey,
  warehousePrepStatusSortKey,
} = require('../src/lib/logistics/warehousePrepVisibility')

test('addIsoDays moves calendar days and rejects invalid keys', () => {
  assert.equal(WAREHOUSE_PREP_LEAD_DAYS, 2)
  assert.equal(addIsoDays('2026-08-10', -2), '2026-08-08')
  assert.equal(addIsoDays('2026-08-10', 1), '2026-08-11')
  assert.equal(addIsoDays('not-a-date', 1), null)
})

test('resolveWarehousePrepViewRole maps D/D-1/D-2 and ignores other offsets', () => {
  assert.equal(resolveWarehousePrepViewRole('2026-08-10', '2026-08-10'), 'delivery_today')
  assert.equal(resolveWarehousePrepViewRole('2026-08-09', '2026-08-10'), 'prep_tomorrow')
  assert.equal(resolveWarehousePrepViewRole('2026-08-08', '2026-08-10'), 'early_prep')
  assert.equal(resolveWarehousePrepViewRole('2026-08-07', '2026-08-10'), null)
  assert.equal(resolveWarehousePrepViewRole('bad', '2026-08-10'), null)
})

test('listWarehousePrepViewDaysForDelivery clips to the visible range', () => {
  assert.deepEqual(
    listWarehousePrepViewDaysForDelivery({
      deliveryDate: '2026-08-10',
      rangeStart: '2026-08-09',
      rangeEnd: '2026-08-10',
    }),
    [
      { viewDay: '2026-08-09', viewRole: 'prep_tomorrow' },
      { viewDay: '2026-08-10', viewRole: 'delivery_today' },
    ]
  )

  assert.deepEqual(
    listWarehousePrepViewDaysForDelivery({
      deliveryDate: '2026-08-10',
      rangeStart: '2026-08-01',
      rangeEnd: '2026-08-05',
    }),
    []
  )
})

test('deliveryDateRangeForPrepViewWindow extends end by lead days', () => {
  assert.deepEqual(deliveryDateRangeForPrepViewWindow('2026-08-01', '2026-08-05'), {
    deliveryStart: '2026-08-01',
    deliveryEnd: '2026-08-07',
  })
  assert.deepEqual(deliveryDateRangeForPrepViewWindow('bad', '2026-08-05'), {
    deliveryStart: '',
    deliveryEnd: '',
  })
})

test('warehouse prep sort keys keep slot and status priority stable', () => {
  assert.ok(warehousePrepSlotSortKey('mati') < warehousePrepSlotSortKey('tarda'))
  assert.ok(warehousePrepSlotSortKey('vespre') < warehousePrepSlotSortKey('unknown'))
  assert.ok(warehousePrepStatusSortKey('issue') < warehousePrepStatusSortKey('pending'))
  assert.ok(warehousePrepStatusSortKey('ready') < warehousePrepStatusSortKey('sent'))
})

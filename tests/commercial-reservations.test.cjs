const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  getCommercialReservationEndDate,
  getCommercialReservationDayKeys,
} = require('../src/lib/commercialReservations')

test('getCommercialReservationEndDate falls back to start date', () => {
  assert.equal(getCommercialReservationEndDate({ date: '2026-08-01', endDate: null }), '2026-08-01')
  assert.equal(getCommercialReservationEndDate({ date: '2026-08-01', endDate: '  ' }), '2026-08-01')
  assert.equal(
    getCommercialReservationEndDate({ date: '2026-08-01', endDate: '2026-08-03' }),
    '2026-08-03'
  )
})

test('getCommercialReservationDayKeys expands inclusive UTC day ranges', () => {
  assert.deepEqual(getCommercialReservationDayKeys({ date: '2026-08-01', endDate: '2026-08-03' }), [
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
  ])
  assert.deepEqual(getCommercialReservationDayKeys({ date: '2026-08-10', endDate: null }), [
    '2026-08-10',
  ])
})

test('getCommercialReservationDayKeys handles missing and inverted ranges safely', () => {
  assert.deepEqual(getCommercialReservationDayKeys({ date: '', endDate: '2026-08-03' }), [])
  assert.deepEqual(getCommercialReservationDayKeys({ date: '2026-08-05', endDate: '2026-08-01' }), [
    '2026-08-05',
  ])
  assert.deepEqual(getCommercialReservationDayKeys({ date: 'not-a-date', endDate: '2026-08-01' }), [
    'not-a-date',
  ])
})

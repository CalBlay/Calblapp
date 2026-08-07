const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  parseMaintenanceFilterDate,
  formatMaintenanceDateRangeLabel,
  getMaintenanceDateRangeMs,
  matchesMaintenancePlannedDateFilter,
  matchesMaintenanceTicketDateFilter,
} = require('../src/lib/maintenanceDateFilter')

const RANGE_START = '2026-08-03'
const RANGE_END = '2026-08-09'

test('parseMaintenanceFilterDate accepts ms/ISO and rejects empty/invalid', () => {
  const ms = Date.parse('2026-08-05T12:00:00.000Z')
  assert.equal(parseMaintenanceFilterDate(ms)?.getTime(), ms)
  assert.equal(
    parseMaintenanceFilterDate('2026-08-05T12:00:00.000Z')?.toISOString(),
    '2026-08-05T12:00:00.000Z'
  )
  assert.equal(parseMaintenanceFilterDate(null), null)
  assert.equal(parseMaintenanceFilterDate(undefined), null)
  assert.equal(parseMaintenanceFilterDate(''), null)
  assert.equal(parseMaintenanceFilterDate('not-a-date'), null)
})

test('formatMaintenanceDateRangeLabel collapses single-day ranges', () => {
  assert.equal(formatMaintenanceDateRangeLabel('2026-08-05', '2026-08-05'), '2026-08-05')
  assert.equal(
    formatMaintenanceDateRangeLabel(RANGE_START, RANGE_END),
    `${RANGE_START} - ${RANGE_END}`
  )
})

test('getMaintenanceDateRangeMs covers full local start/end days', () => {
  const { startMs, endMs } = getMaintenanceDateRangeMs(RANGE_START, RANGE_END)
  assert.equal(startMs < endMs, true)
  assert.equal(new Date(startMs).getHours(), 0)
  assert.equal(new Date(endMs).getHours(), 23)
})

test('matchesMaintenancePlannedDateFilter ignores range in all mode and requires planned date otherwise', () => {
  assert.equal(
    matchesMaintenancePlannedDateFilter({
      mode: 'all',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: null,
    }),
    true
  )
  assert.equal(
    matchesMaintenancePlannedDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: null,
    }),
    false
  )
  assert.equal(
    matchesMaintenancePlannedDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: '2026-08-05T10:00:00.000Z',
    }),
    true
  )
  assert.equal(
    matchesMaintenancePlannedDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: '2026-08-01T10:00:00.000Z',
    }),
    false
  )
})

test('matchesMaintenanceTicketDateFilter uses plannedStart when set, else createdAt', () => {
  // Planned ticket: filter by planned date even when createdAt is outside range.
  assert.equal(
    matchesMaintenanceTicketDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: '2026-08-06T09:00:00.000Z',
      createdAt: '2026-07-01T09:00:00.000Z',
    }),
    true
  )
  assert.equal(
    matchesMaintenanceTicketDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: '2026-07-01T09:00:00.000Z',
      createdAt: '2026-08-06T09:00:00.000Z',
    }),
    false
  )

  // Unplanned ticket: fall back to createdAt.
  assert.equal(
    matchesMaintenanceTicketDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: null,
      createdAt: '2026-08-04T15:00:00.000Z',
    }),
    true
  )
  assert.equal(
    matchesMaintenanceTicketDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: '',
      createdAt: '2026-08-20T15:00:00.000Z',
    }),
    false
  )
  assert.equal(
    matchesMaintenanceTicketDateFilter({
      mode: 'planned',
      start: RANGE_START,
      end: RANGE_END,
      plannedStart: null,
      createdAt: null,
    }),
    false
  )
})

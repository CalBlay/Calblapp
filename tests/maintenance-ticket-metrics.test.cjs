const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  computeHistoryWorkMinutes,
  computeOperatorWorkMinutes,
  computeTicketWorkMinutes,
  getMinutesFromTimeRange,
  resolvePreventiuWorkMinutesForReport,
  resolveTicketWorkMinutesForReport,
  ticketInvolvesOperator,
} = require('../src/lib/informes/maintenanceTicketMetrics')

const DAY1 = Date.parse('2026-07-23T08:00:00.000Z')
const DAY2 = Date.parse('2026-07-24T08:00:00.000Z')

test('getMinutesFromTimeRange returns positive same-day spans and clamps overnight to 0', () => {
  assert.equal(getMinutesFromTimeRange('09:00', '10:30'), 90)
  assert.equal(getMinutesFromTimeRange('22:00', '02:00'), 0)
  assert.equal(getMinutesFromTimeRange('09:00', null), 0)
  assert.equal(getMinutesFromTimeRange('bad', '10:00'), 0)
})

test('computeHistoryWorkMinutes sums closed same-day segments and dedupes identical rows', () => {
  const history = [
    { at: DAY1, startTime: '09:00', endTime: '10:00', byId: 'op-1' },
    { at: DAY1, startTime: '09:00', endTime: '10:00', byId: 'op-1' },
    { at: DAY1, startTime: '11:00', endTime: '11:45', byId: 'op-2' },
  ]

  assert.equal(computeHistoryWorkMinutes(history), 105)
})

test('computeHistoryWorkMinutes pairs open start with a later end across days (overnight handoff)', () => {
  const history = [
    { at: DAY1, startTime: '22:00', endTime: null, byId: 'op-1' },
    { at: DAY2, startTime: null, endTime: '02:00', byId: 'op-1' },
  ]

  // 22:00 day1 -> 02:00 day2 = 4 hours
  assert.equal(computeHistoryWorkMinutes(history), 240)
})

test('computeHistoryWorkMinutes falls back to time-range math when timestamps are unusable', () => {
  const history = [
    { at: 'not-a-date', startTime: '08:00', endTime: '09:15', byId: 'op-1' },
  ]

  assert.equal(computeHistoryWorkMinutes(history), 75)
})

test('computeHistoryWorkMinutes accepts unix seconds timestamps', () => {
  const history = [
    { at: Math.floor(DAY1 / 1000), startTime: '09:00', endTime: '09:30', byId: 'op-1' },
  ]

  assert.equal(computeHistoryWorkMinutes(history), 30)
})

test('computeTicketWorkMinutes prefers workLogs over status history', () => {
  const history = [
    { at: DAY1, startTime: '09:00', endTime: '12:00', byId: 'op-1' },
  ]
  const workLogs = [
    {
      at: DAY1,
      startTime: '09:00',
      endTime: '10:00',
      byId: 'op-1',
      sourceStatus: 'en_curs',
    },
  ]

  assert.equal(computeTicketWorkMinutes(history, workLogs), 60)
  assert.equal(computeTicketWorkMinutes(history, []), 180)
})

test('operator resolution uses byId history when workLogs are absent', () => {
  const history = [
    { at: DAY1, startTime: '09:00', endTime: '10:00', byId: 'op-1' },
    { at: DAY1, startTime: '10:00', endTime: '11:30', byId: 'op-2' },
  ]

  assert.equal(computeOperatorWorkMinutes(history, 'op-2'), 90)
  assert.equal(resolveTicketWorkMinutesForReport(history, ['op-1', 'op-2'], 'op-2'), 90)
  assert.equal(resolveTicketWorkMinutesForReport(history, ['op-1'], 'op-1'), 60)
  assert.equal(resolveTicketWorkMinutesForReport(history, ['op-1'], 'stranger'), 0)
  assert.equal(ticketInvolvesOperator(['op-9'], history, 'op-2'), true)
  assert.equal(ticketInvolvesOperator(['op-9'], history, 'stranger'), false)
})

test('resolvePreventiuWorkMinutesForReport falls back to planned minutes when history is empty', () => {
  assert.equal(resolvePreventiuWorkMinutesForReport([], ['op-1'], 120), 120)
  assert.equal(resolvePreventiuWorkMinutesForReport([], ['op-1'], 120, 'op-1'), 120)
  assert.equal(resolvePreventiuWorkMinutesForReport([], ['op-1'], 120, 'op-2'), 0)

  const history = [
    { at: DAY1, startTime: '09:00', endTime: '09:40', byId: 'op-1' },
  ]
  assert.equal(resolvePreventiuWorkMinutesForReport(history, ['op-1'], 120, 'op-1'), 40)
})

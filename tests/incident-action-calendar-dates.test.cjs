const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  incidentActionCalendarStartDate,
  isoToBarcelonaCalendarDate,
} = require('../src/lib/incidentActionCalendarDates')

const ROOT = path.join(__dirname, '..')

test('plain calendar days pass through without timezone conversion', () => {
  assert.equal(isoToBarcelonaCalendarDate('2026-09-10'), '2026-09-10')
  assert.equal(isoToBarcelonaCalendarDate(' 2026-09-10 '), '2026-09-10')
})

test('invalid or empty timestamps do not produce a Graph day', () => {
  assert.equal(isoToBarcelonaCalendarDate(null), '')
  assert.equal(isoToBarcelonaCalendarDate(undefined), '')
  assert.equal(isoToBarcelonaCalendarDate(''), '')
  assert.equal(isoToBarcelonaCalendarDate('   '), '')
  assert.equal(isoToBarcelonaCalendarDate('not-a-date'), '')
})

test('ISO timestamps convert to Europe/Madrid calendar days, not UTC or local', () => {
  // CEST (UTC+2): 22:30Z is already the next calendar day in Barcelona.
  assert.equal(
    isoToBarcelonaCalendarDate('2026-07-10T22:30:00.000Z'),
    '2026-07-11'
  )
  assert.equal(
    isoToBarcelonaCalendarDate('2026-07-10T21:30:00.000Z'),
    '2026-07-10'
  )
  // CET (UTC+1): 23:30Z rolls to the next day; 22:30Z stays the same day.
  assert.equal(
    isoToBarcelonaCalendarDate('2026-01-10T23:30:00.000Z'),
    '2026-01-11'
  )
  assert.equal(
    isoToBarcelonaCalendarDate('2026-01-10T22:30:00.000Z'),
    '2026-01-10'
  )
})

test('Outlook all-day start cannot be after the deadline', () => {
  assert.equal(
    incidentActionCalendarStartDate('2026-09-01', '2026-09-10'),
    '2026-09-01'
  )
  assert.equal(
    incidentActionCalendarStartDate('2026-09-10', '2026-09-10'),
    '2026-09-10'
  )
  assert.equal(
    incidentActionCalendarStartDate('2026-09-11', '2026-09-10'),
    '2026-09-10'
  )
})

test('invalid start dates fall back to the deadline day', () => {
  assert.equal(incidentActionCalendarStartDate('', '2026-09-10'), '2026-09-10')
  assert.equal(incidentActionCalendarStartDate(null, '2026-09-10'), '2026-09-10')
  assert.equal(
    incidentActionCalendarStartDate('2026-09-01T00:00:00.000Z', '2026-09-10'),
    '2026-09-10'
  )
  assert.equal(
    incidentActionCalendarStartDate(' 2026-09-01 ', '2026-09-10'),
    '2026-09-01'
  )
})

test('incident action Outlook creation uses Madrid days and the start-date clamp', () => {
  const notifications = fs.readFileSync(
    path.join(ROOT, 'src/lib/incidentActionNotifications.ts'),
    'utf8'
  )
  const calendar = fs.readFileSync(
    path.join(ROOT, 'src/services/graph/calendar.ts'),
    'utf8'
  )
  assert.match(notifications, /isoToBarcelonaCalendarDate\(params\.dueAtIso\)/)
  assert.match(notifications, /isoToBarcelonaCalendarDate\(params\.createdAtIso\)/)
  assert.match(calendar, /incidentActionCalendarStartDate\(input\.startDate, deadline\)/)
})

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  isRepeatablePmCode,
  reserveAdaEventCode,
} = require('../src/services/sync/adaCodePolicy.ts')

test('a regular ADA code can only be reserved by one event per sync', () => {
  const owners = new Map()

  assert.equal(reserveAdaEventCode(owners, 'E2600588', 'event-1'), true)
  assert.equal(reserveAdaEventCode(owners, ' e2600588 ', 'event-2'), false)
  assert.equal(reserveAdaEventCode(owners, 'E2600588', 'event-3'), false)
  assert.equal(owners.get('E2600588'), 'event-1')
})

test('PM codes remain repeatable', () => {
  const owners = new Map()

  assert.equal(isRepeatablePmCode('PM_2600588'), true)
  assert.equal(isRepeatablePmCode('PM2-2600588'), true)
  assert.equal(reserveAdaEventCode(owners, 'PM_2600588', 'event-1'), true)
  assert.equal(reserveAdaEventCode(owners, 'PM_2600588', 'event-2'), true)
  assert.equal(owners.size, 0)
})

test('manual calendar updates reject duplicate codes with event details', () => {
  const route = fs.readFileSync(
    path.join(
      __dirname,
      '../src/app/api/calendar/manual/[id]/route.ts'
    ),
    'utf8'
  )
  const conflictLookup = fs.readFileSync(
    path.join(
      __dirname,
      '../src/lib/calendar/eventCodeConflicts.server.ts'
    ),
    'utf8'
  )

  assert.match(route, /reason: 'duplicate_event_code'/)
  assert.match(route, /conflicts: err\.conflicts/)
  assert.match(route, /\{ status: 409 \}/)
  assert.match(conflictLookup, /data\.NomEvent/)
  assert.match(conflictLookup, /data\.DataInici/)
})

test('calendar modal shows the events that already use a manual code', () => {
  const modal = fs.readFileSync(
    path.join(__dirname, '../src/components/calendar/CalendarModal.tsx'),
    'utf8'
  )

  assert.match(modal, /response\.status === 409/)
  assert.match(modal, /Aquest codi ja el tenen:/)
  assert.match(modal, /conflict\.name/)
  assert.match(modal, /conflict\.date/)
  assert.match(modal, /conflict\.location/)
})

test('new manual events use the same duplicate-code contract', () => {
  const route = fs.readFileSync(
    path.join(__dirname, '../src/app/api/events/create/route.ts'),
    'utf8'
  )
  const modal = fs.readFileSync(
    path.join(__dirname, '../src/components/calendar/CalendarNewEventModal.tsx'),
    'utf8'
  )

  assert.match(route, /assertCalendarEventCodeAvailable/)
  assert.match(route, /reason: 'duplicate_event_code'/)
  assert.match(modal, /res\.status === 409/)
  assert.match(modal, /Aquest codi ja el tenen:/)
})

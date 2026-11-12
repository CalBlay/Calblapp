const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  canProvisionalPmShareAdaCode,
  isProvisionalPmCode,
  isRepeatablePmCode,
  preferRealAdaCode,
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

test('every PM-prefixed calendar code is provisional', () => {
  assert.equal(isProvisionalPmCode('PM'), true)
  assert.equal(isProvisionalPmCode(' pm-client-sense-projecte '), true)
  assert.equal(isProvisionalPmCode('PM2_2600588'), true)
  assert.equal(isProvisionalPmCode('E2600588'), false)
  assert.equal(isRepeatablePmCode('PMCLIENT'), true)
})

test('a real ADA code replaces a provisional PM in operational views', () => {
  assert.equal(preferRealAdaCode('PM_CLIENT', 'E2600588'), 'E2600588')
  assert.equal(preferRealAdaCode('PM_CLIENT', 'PM_ADA'), 'PM_CLIENT')
  assert.equal(preferRealAdaCode('MANUAL-1', 'E2600588'), 'MANUAL-1')
  assert.equal(preferRealAdaCode('', 'E2600588'), 'E2600588')
})

test('only a safely matched PM may share the real event ADA code', () => {
  assert.equal(canProvisionalPmShareAdaCode('PM181120262', 3), true)
  assert.equal(canProvisionalPmShareAdaCode('PM181120262', 2), false)
  assert.equal(canProvisionalPmShareAdaCode('E2700036', 4), false)
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

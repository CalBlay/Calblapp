const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

require('./register.cjs')

const { isCalendarDealCancelled } = require('@/lib/calendar/calendarCancellation')

const ROOT = path.join(__dirname, '..')

test('calendar cancellation is explicit and does not infer from other event fields', () => {
  assert.equal(isCalendarDealCancelled({ cancelled: true }), true)
  assert.equal(isCalendarDealCancelled({ cancelled: false }), false)
  assert.equal(isCalendarDealCancelled({}), false)
})

test('calendar cancellation routes authenticate, authorize, and validate collections', () => {
  for (const relativePath of [
    'src/app/api/calendar/manual/[id]/cancel/route.ts',
    'src/app/api/calendar/manual/[id]/cancellation-email/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    assert.match(source, /requireAuth\(\)/)
    assert.match(source, /isUiPermissionGranted/)
    assert.match(source, /isAllowedCalendarManualCollection\(collection\)/)
  }
})

test('cancellation email requires a cancelled event before sending through Outlook', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/calendar/manual/[id]/cancellation-email/route.ts'),
    'utf8'
  )
  const cancelledGuard = source.indexOf("snap.get('cancelled') !== true")
  const sendCall = source.indexOf('sendOutlookTextMail({')
  assert.ok(cancelledGuard >= 0)
  assert.ok(sendCall > cancelledGuard)
})

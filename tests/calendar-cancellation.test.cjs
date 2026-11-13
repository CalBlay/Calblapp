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

test('manual cancellation records and clears its source explicitly', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'src/app/api/calendar/manual/[id]/cancel/route.ts'),
    'utf8'
  )

  assert.match(source, /cancellationSource: 'manual'/)
  assert.match(source, /cancellationSource: null/)
  assert.match(source, /cancellationReason: cancellationReason \|\| null/)
  assert.match(source, /cancellationReason: null/)
})

test('calendar cancellation dialog captures and displays a short reason', () => {
  const modalSource = fs.readFileSync(
    path.join(ROOT, 'src/components/calendar/CalendarModal.tsx'),
    'utf8'
  )
  const rangeSource = fs.readFileSync(
    path.join(ROOT, 'src/lib/api/calendarEventsRange.ts'),
    'utf8'
  )

  assert.match(modalSource, /Motiu de cancel·lació/)
  assert.match(modalSource, /maxLength=\{300\}/)
  assert.match(modalSource, /cancellationReason: nextCancelled \? reason\.trim\(\) : ''/)
  assert.match(rangeSource, /cancellationReason/)
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

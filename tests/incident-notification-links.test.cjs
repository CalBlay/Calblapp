const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const {
  incidentActionNotificationHref,
  incidentNotificationHref,
  incidentOperationsHref,
} = require('../src/lib/incidentNotificationLinks')

test('incident notifications deep-link to the incident without a date range', () => {
  assert.equal(
    incidentNotificationHref('incident-1'),
    '/menu/incidents?incidentId=incident-1&dateMode=all'
  )
})

test('incident action notifications deep-link to the exact action without a date range', () => {
  assert.equal(
    incidentActionNotificationHref('action-1'),
    '/menu/incidents/accions?actionId=action-1&dateMode=all'
  )
})

test('incident notification links fall back to their corresponding module', () => {
  assert.equal(incidentNotificationHref(''), '/menu/incidents')
  assert.equal(incidentActionNotificationHref(null), '/menu/incidents/accions')
})

test('view incident opens the exact incident with its operations expanded', () => {
  assert.equal(
    incidentOperationsHref('incident-1'),
    '/menu/incidents?incidentId=incident-1&ops=1&dateMode=all'
  )
})

test('opening an incident bell notification marks it read before navigating', () => {
  const source = readFileSync(
    join(__dirname, '../src/app/menu/incidents/components/IncidentNotificationsBell.tsx'),
    'utf8'
  )
  const markIndex = source.indexOf('await onDismiss(notification.id)')
  const navigateIndex = source.indexOf('router.push(href)')
  assert.ok(markIndex >= 0)
  assert.ok(navigateIndex > markIndex)
})

test('reading a stored action notification also dismisses its synthetic fallback', () => {
  const source = readFileSync(
    join(__dirname, '../src/app/menu/incidents/components/IncidentNotificationsBell.tsx'),
    'utf8'
  )
  assert.match(source, /dismissSynthetic\(\[`synthetic-action-\$\{actionId\}`\]\)/)
})

test('an incident deep link hides weekly controls so they cannot override the target', () => {
  const source = readFileSync(join(__dirname, '../src/app/menu/incidents/page.tsx'), 'utf8')
  assert.match(source, /deepLinkIncidentId \? \(/)
  assert.match(source, /Sense filtre de data · incidència seleccionada/)
})

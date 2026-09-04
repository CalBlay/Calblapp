const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')
const read = (file) => readFileSync(join(root, file), 'utf8')

test('Incidents menu badge uses the same assigned-action visibility as its bell', () => {
  const countHook = read('src/hooks/useIncidentNotificationCount.ts')
  const bell = read('src/app/menu/incidents/components/IncidentNotificationsBell.tsx')

  assert.match(countHook, /status=all&scope=assigned/)
  assert.match(countHook, /isIncidentActionNotificationVisible\(notification, assignedActionIds\)/)
  assert.match(countHook, /isPendingIncidentActionStatus\(action\.status\)/)
  assert.match(bell, /isIncidentActionNotificationVisible\(notification, assignedActionIds\)/)
  assert.doesNotMatch(countHook, /Math\.max\(summary\.incidents, count\)/)
})

test('empty live Ops channel data overrides a stale summary count with zero', () => {
  const source = read('src/hooks/useMessagingUnread.ts')

  assert.match(source, /if \(data === undefined\) return summary\.messaging/)
  assert.match(source, /OPS_VISIBLE_SOURCES/)
  assert.match(source, /channel\.status/)
  assert.match(source, /channel\.visibleUntil/)
  assert.doesNotMatch(source, /if \(channels\.length === 0\) return summary\.messaging/)
})

test('Incidents and Roba personal persist synthetic dismissals per user on the server', () => {
  const incidentCount = read('src/hooks/useIncidentNotificationCount.ts')
  const incidentBell = read('src/app/menu/incidents/components/IncidentNotificationsBell.tsx')
  const robaCount = read('src/hooks/useAdminNotifications.ts')
  const robaBell = read('src/app/menu/roba-personal/RobaPersonalRequestNotificationsBell.tsx')
  const dismissalsHook = read('src/hooks/useSyntheticNotificationDismissals.ts')
  const dismissalsApi = read('src/app/api/notifications/synthetic-dismissals/route.ts')

  assert.match(incidentCount, /useSyntheticNotificationDismissals\('incidents'\)/)
  assert.match(incidentBell, /dismissSynthetic\(syntheticIds\)/)
  assert.match(robaCount, /useSyntheticNotificationDismissals\('roba_personal'\)/)
  assert.match(robaBell, /dismissSynthetic\(syntheticIds\)/)
  assert.match(dismissalsHook, /LEGACY_STORAGE_KEYS/)
  assert.match(dismissalsHook, /\/api\/notifications\/synthetic-dismissals/)
  assert.match(dismissalsApi, /FieldValue\.arrayUnion/)
  assert.match(dismissalsApi, /notificationPreferences/)
})

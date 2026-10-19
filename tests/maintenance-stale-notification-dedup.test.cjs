const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src/lib/maintenanceNotifications.ts'),
  'utf8'
)

test('stale maintenance notifications are created once instead of reset every cron run', () => {
  assert.match(source, /await ref\.create\(notificationData\)/)
  assert.match(source, /code === 6 \|\| code === 'already-exists'/)
  assert.match(source, /if \(!notifiedUids\.length\) return/)
  assert.doesNotMatch(source, /batch\.set\(ref, data, \{ merge: true \}\)/)
})

test('push and realtime fan-out only target newly created notifications', () => {
  assert.match(source, /sendPushToUsers\(notifiedUids,/)
  assert.match(source, /notifiedUids\.map\(\(uid\) => \(\{ userId: uid/)
  assert.match(source, /notifiedUids\.map\(\(uid\) =>\s*\n\s*rest\.channels/)
})

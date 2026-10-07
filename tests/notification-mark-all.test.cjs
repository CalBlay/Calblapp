const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')

test('mark all deletes every matching notification in Firestore-safe batches', () => {
  const source = readFileSync(join(root, 'src/app/api/notifications/route.ts'), 'utf8')

  assert.match(source, /FIRESTORE_BATCH_DELETE_LIMIT = 450/)
  assert.match(source, /index \+= FIRESTORE_BATCH_DELETE_LIMIT/)
  assert.match(source, /batch\.delete\(doc\.ref\)/)
  assert.match(source, /await deleteNotificationDocs\(docs\)/)
  assert.match(source, /await syncUserUnreadBuckets\(userId\)/)
})

test('maintenance mark all sends the complete notification family in one request', () => {
  const bell = readFileSync(
    join(root, 'src/app/menu/manteniment/components/MaintenanceNotificationsBell.tsx'),
    'utf8'
  )
  const client = readFileSync(join(root, 'src/lib/notifications/markRead.ts'), 'utf8')

  assert.match(bell, /markAllNotificationsRead\(notificationTypes\)/)
  assert.match(client, /JSON\.stringify\(\{ action: 'markAllRead', types \}\)/)
  assert.match(client, /ensureSuccessfulResponse\(response\)/)
})

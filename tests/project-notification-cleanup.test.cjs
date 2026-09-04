const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const root = join(__dirname, '..')

test('project deletion removes matching notifications from every user', () => {
  const source = readFileSync(join(root, 'src/app/api/projects/[id]/route.ts'), 'utf8')

  assert.match(source, /collection\('users'\)\.select\(\)\.get\(\)/)
  assert.match(source, /collection\('notifications'\)\.where\('projectId', '==', id\)/)
  assert.match(source, /decrementUnreadFromNotificationDocs\(group\.userId, group\.docs\)/)
  assert.doesNotMatch(source, /notifications cleanup skipped while deleting project/)
})

test('notification listing purges notifications whose project no longer exists', () => {
  const source = readFileSync(join(root, 'src/app/api/notifications/route.ts'), 'utf8')
  const reconciler = readFileSync(
    join(root, 'src/lib/notifications/projectNotificationCount.server.ts'),
    'utf8'
  )

  assert.match(source, /pruneDeletedProjectNotifications/)
  assert.match(reconciler, /projectSnaps\.filter\(\(snap\) => snap\.exists\)/)
  assert.match(reconciler, /batch\.delete\(doc\.ref\)/)
})

test('notification summary reconciles the projects badge with existing projects', () => {
  const source = readFileSync(join(root, 'src/lib/notifications/summaryParts.ts'), 'utf8')

  assert.match(source, /reconcileProjectNotificationCount\(userId\)/)
  assert.match(source, /projects: projectCount \?\? buckets\.projects/)
})

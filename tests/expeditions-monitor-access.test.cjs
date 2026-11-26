const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  EXPEDITIONS_MONITOR_USER_ID,
  isExpeditionsMonitorUser,
} = require('../src/lib/logistics/expeditionsMonitorAccess.ts')

const root = path.resolve(__dirname, '..')

test('only the dedicated account is recognized as the expeditions monitor', () => {
  assert.equal(EXPEDITIONS_MONITOR_USER_ID, 'iD7OMe2lG6Oi68xHbXc9')
  assert.equal(isExpeditionsMonitorUser(EXPEDITIONS_MONITOR_USER_ID), true)
  assert.equal(isExpeditionsMonitorUser('another-user'), false)
  assert.equal(isExpeditionsMonitorUser(''), false)
})

test('loading grants the monitor read access but keeps PATCH role-protected', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/app/api/logistics/loading/route.ts'),
    'utf8'
  )
  const getBlock = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function PATCH'))
  const patchBlock = source.slice(source.indexOf('export async function PATCH'))

  assert.match(getBlock, /forbidden && !isExpeditionsMonitorUser\(auth\.user\.id\)/)
  assert.match(patchBlock, /requireRoles\(auth, ALLOWED_ROLES\)/)
  assert.doesNotMatch(patchBlock, /isExpeditionsMonitorUser/)
})

test('the monitor route uses the chrome-free layout', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/ClientLayout.tsx'), 'utf8')
  assert.match(source, /pathname\.startsWith\('\/monitor\/expedicions'\)/)
  assert.match(source, /isExpeditionsMonitorRoute[\s\S]*min-h-\[100dvh\] bg-slate-950 text-white/)
})

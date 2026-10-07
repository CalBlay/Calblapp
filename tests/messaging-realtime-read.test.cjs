const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const source = readFileSync(
  join(__dirname, '../src/app/menu/missatgeria/page.tsx'),
  'utf8'
)

test('the open Ops channel is marked read for realtime messages and inbox updates', () => {
  assert.match(source, /handler: \(message\) => \{[\s\S]*markChannelRead\(data\.channelId\)/)
  assert.match(source, /syncMessagesLocal\([\s\S]*markChannelRead\(selectedChannelId\)/)
  assert.match(source, /unreadCount: 0/)
  assert.match(source, /mutateCache\('\/api\/notifications\/summary'\)/)
})

test('sent messages render optimistically before waiting for the API response', () => {
  const optimisticAt = source.indexOf(
    'syncMessagesLocal((current) => [optimisticMessage, ...current])'
  )
  const requestAt = source.indexOf(
    'const sendRes = await fetch(`/api/messaging/channels/${selectedChannelId}/messages`'
  )

  assert.ok(optimisticAt >= 0)
  assert.ok(requestAt > optimisticAt)
  assert.match(source, /refreshInterval: selectedChannelId \? 4_000 : 0/)
  assert.match(source, /message\.id\.startsWith\('pending-'\)/)
})

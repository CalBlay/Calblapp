const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  resolveChannelUnreadCounts,
  buildUnreadIncrement,
  buildUnreadDecrement,
} = require('../src/lib/messaging/channelUnread')

test('resolveChannelUnreadCounts derives legacy channel unread and clamps negatives', () => {
  assert.deepEqual(resolveChannelUnreadCounts(null), {
    directUnreadCount: 0,
    channelUnreadCount: 0,
    totalUnread: 0,
  })

  assert.deepEqual(
    resolveChannelUnreadCounts({ unreadCount: 5, directUnreadCount: 2 }),
    {
      directUnreadCount: 2,
      channelUnreadCount: 3,
      totalUnread: 5,
    }
  )

  assert.deepEqual(
    resolveChannelUnreadCounts({
      unreadCount: 2,
      directUnreadCount: 1,
      channelUnreadCount: 4,
    }),
    {
      directUnreadCount: 1,
      channelUnreadCount: 4,
      totalUnread: 5,
    }
  )

  assert.deepEqual(
    resolveChannelUnreadCounts({
      unreadCount: -3,
      directUnreadCount: -1,
      channelUnreadCount: -2,
    }),
    {
      directUnreadCount: 0,
      channelUnreadCount: 0,
      totalUnread: 0,
    }
  )
})

test('buildUnreadIncrement bumps only the matching visibility bucket', () => {
  const member = {
    unreadCount: 3,
    directUnreadCount: 1,
    channelUnreadCount: 2,
  }

  assert.deepEqual(buildUnreadIncrement('direct', member), {
    unreadCount: 4,
    directUnreadCount: 2,
    channelUnreadCount: 2,
  })
  assert.deepEqual(buildUnreadIncrement('channel', member), {
    unreadCount: 4,
    directUnreadCount: 1,
    channelUnreadCount: 3,
  })
})

test('buildUnreadDecrement floors all counts at zero', () => {
  assert.deepEqual(
    buildUnreadDecrement('direct', {
      unreadCount: 1,
      directUnreadCount: 1,
      channelUnreadCount: 0,
    }),
    {
      unreadCount: 0,
      directUnreadCount: 0,
      channelUnreadCount: 0,
    }
  )

  assert.deepEqual(
    buildUnreadDecrement('channel', {
      unreadCount: 0,
      directUnreadCount: 0,
      channelUnreadCount: 0,
    }),
    {
      unreadCount: 0,
      directUnreadCount: 0,
      channelUnreadCount: 0,
    }
  )
})

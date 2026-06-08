'use client'

import Ably from 'ably'

let client: Ably.Realtime | null = null
let boundUserId: string | null = null

function attachConnectionGuards(realtime: Ably.Realtime) {
  realtime.connection.on((stateChange) => {
    const reason = stateChange.reason
    const message = String(reason?.message || '').toLowerCase()
    const denied =
      stateChange.current === 'failed' &&
      (message.includes('capability') || message.includes('denied') || reason?.code === 40160)

    if (denied) {
      console.warn('[ably] capability denied, resetting client', reason)
      resetAblyClient()
    }
  })
}

export function resetAblyClient() {
  if (!client) {
    boundUserId = null
    return
  }

  try {
    client.close()
  } catch (error) {
    console.warn('[ably] close failed', error)
  }

  client = null
  boundUserId = null
}

export function getAblyClient(userId?: string | null) {
  const nextUserId = String(userId || '').trim() || null

  if (client && nextUserId && boundUserId && boundUserId !== nextUserId) {
    resetAblyClient()
  }

  if (!client) {
    boundUserId = nextUserId
    client = new Ably.Realtime({
      authUrl: '/api/ably/token',
      authMethod: 'POST',
    })
    attachConnectionGuards(client)
  }

  return client
}

function userIdFromChannel(channelName: string): string | null {
  const match = /^user:([^:]+):notifications$/.exec(String(channelName || '').trim())
  return match?.[1] ? match[1] : null
}

export function subscribeToAblyEvent(params: {
  channelName: string
  eventName: string
  handler: (...args: unknown[]) => void
}) {
  const channelUserId = userIdFromChannel(params.channelName)
  const realtime = getAblyClient(channelUserId)
  const name = params.channelName
  let channel = realtime.channels.get(name)

  if (channel.state === 'failed') {
    try {
      realtime.channels.release(name)
    } catch (error) {
      console.warn(`[ably] release failed channel ${name}`, error)
    }
    channel = realtime.channels.get(name)
  }

  const onChannelFailed = (stateChange: Ably.ChannelStateChange) => {
    const reason = stateChange.reason
    console.warn(`[ably] channel failed ${name}`, reason)
    if (String(reason?.message || '').toLowerCase().includes('capability')) {
      resetAblyClient()
    }
  }

  channel.on('failed', onChannelFailed)

  try {
    channel.subscribe(params.eventName, params.handler)
  } catch (error) {
    console.warn(`[ably] subscribe failed for ${name}:${params.eventName}`, error)
    channel.off('failed', onChannelFailed)
    return () => {}
  }

  return () => {
    try {
      channel.off('failed', onChannelFailed)
      channel.unsubscribe(params.eventName, params.handler)
    } catch (error) {
      console.warn(`[ably] unsubscribe failed for ${name}:${params.eventName}`, error)
    }
  }
}

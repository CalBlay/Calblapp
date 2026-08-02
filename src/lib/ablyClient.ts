'use client'

import Ably from 'ably'

let client: Ably.Realtime | null = null
let boundUserId: string | null = null
let connectionGuardHandler: ((stateChange: Ably.ConnectionStateChange) => void) | null = null

function detachConnectionGuards(realtime: Ably.Realtime) {
  if (!connectionGuardHandler) return

  try {
    realtime.connection.off(connectionGuardHandler)
  } catch (error) {
    console.warn('[ably] detach connection guard failed', error)
  }

  connectionGuardHandler = null
}

function attachConnectionGuards(realtime: Ably.Realtime) {
  detachConnectionGuards(realtime)

  connectionGuardHandler = (stateChange) => {
    const reason = stateChange.reason
    const message = String(reason?.message || '').toLowerCase()
    const denied =
      stateChange.current === 'failed' &&
      (message.includes('capability') || message.includes('denied') || reason?.code === 40160)

    if (denied) {
      console.warn('[ably] capability denied, resetting client', reason)
      resetAblyClient()
    }
  }

  realtime.connection.on(connectionGuardHandler)
}

function isBenignAblyCloseError(error: unknown) {
  const message =
    (error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        String((error as any).message || '')
      : String(error || '')
    ).toLowerCase()
  return (
    message.includes('connection closed') ||
    message.includes('connection is closed') ||
    message.includes('closed') ||
    message.includes('closing')
  )
}

export function resetAblyClient() {
  const current = client
  client = null
  boundUserId = null

  if (!current) return

  detachConnectionGuards(current)

  const safeLog = (error: unknown) => {
    if (!isBenignAblyCloseError(error)) {
      console.warn('[ably] close failed', error)
    }
  }

  try {
    const state = current.connection.state
    if (state === 'closed' || state === 'closing') return
    current.close()
  } catch (error) {
    safeLog(error)
  }
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
  const match = /^user:([^:]+):(notifications|inbox|direct)$/.exec(String(channelName || '').trim())
  return match?.[1] ? match[1] : null
}

function resolveAblyChannel(realtime: Ably.Realtime, channelName: string): Ably.RealtimeChannel {
  const name = String(channelName || '').trim()
  let channel = realtime.channels.get(name)

  if (channel.state === 'failed') {
    try {
      realtime.channels.release(name)
    } catch (error) {
      console.warn(`[ably] release failed channel ${name}`, error)
    }
    channel = realtime.channels.get(name)
  }

  return channel
}

type AblyMessageHandler = Ably.messageCallback<Ably.Message>

export function bindAblyChannelSubscriptions(params: {
  channelName: string
  userId?: string | null
  subscriptions: Array<{ eventName: string; handler: AblyMessageHandler }>
}): () => void {
  const channelName = String(params.channelName || '').trim()
  if (!channelName || params.subscriptions.length === 0) return () => {}

  const channelUserId = userIdFromChannel(channelName) || params.userId || null
  const realtime = getAblyClient(channelUserId)
  const channel = resolveAblyChannel(realtime, channelName)

  const onChannelFailed = (stateChange: Ably.ChannelStateChange) => {
    const error = stateChange.reason
    console.warn(`[ably] channel failed ${channelName}`, error)
    if (String(error?.message || '').toLowerCase().includes('capability')) {
      resetAblyClient()
    }
  }

  channel.on('failed', onChannelFailed)

  const active: Array<{ eventName: string; handler: AblyMessageHandler }> = []
  for (const subscription of params.subscriptions) {
    try {
      channel.subscribe(subscription.eventName, subscription.handler)
      active.push(subscription)
    } catch (error) {
      console.warn(
        `[ably] subscribe failed for ${channelName}:${subscription.eventName}`,
        error
      )
    }
  }

  return () => {
    channel.off('failed', onChannelFailed)
    for (const subscription of active) {
      try {
        channel.unsubscribe(subscription.eventName, subscription.handler)
      } catch (error) {
        console.warn(
          `[ably] unsubscribe failed for ${channelName}:${subscription.eventName}`,
          error
        )
      }
    }
  }
}

export function publishAblyEvent(params: {
  channelName: string
  eventName: string
  data: unknown
  userId?: string | null
}) {
  const channelName = String(params.channelName || '').trim()
  if (!channelName) return

  try {
    const channelUserId = userIdFromChannel(channelName) || params.userId || null
    const realtime = getAblyClient(channelUserId)
    const channel = resolveAblyChannel(realtime, channelName)
    channel.publish(params.eventName, params.data)
  } catch (error) {
    console.warn(`[ably] publish failed for ${channelName}:${params.eventName}`, error)
  }
}

export function subscribeToAblyEvent(params: {
  channelName: string
  eventName: string
  handler: (...args: unknown[]) => void
}) {
  const channelUserId = userIdFromChannel(params.channelName)
  const realtime = getAblyClient(channelUserId)
  const channel = resolveAblyChannel(realtime, params.channelName)

  const onChannelFailed = (stateChange: Ably.ChannelStateChange) => {
    const error = stateChange.reason
    console.warn(`[ably] channel failed ${params.channelName}`, error)
    if (String(error?.message || '').toLowerCase().includes('capability')) {
      resetAblyClient()
    }
  }

  channel.on('failed', onChannelFailed)

  try {
    channel.subscribe(params.eventName, params.handler)
  } catch (error) {
    console.warn(`[ably] subscribe failed for ${params.channelName}:${params.eventName}`, error)
    channel.off('failed', onChannelFailed)
    return () => {}
  }

  return () => {
    try {
      channel.off('failed', onChannelFailed)
      channel.unsubscribe(params.eventName, params.handler)
    } catch (error) {
      console.warn(`[ably] unsubscribe failed for ${params.channelName}:${params.eventName}`, error)
    }
  }
}

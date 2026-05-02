'use client'

import Ably from 'ably'

let client: Ably.Realtime | null = null

export function getAblyClient() {
  if (client) return client

  client = new Ably.Realtime({
    authUrl: '/api/ably/token',
    authMethod: 'POST',
  })

  return client
}

export function subscribeToAblyEvent(params: {
  channelName: string
  eventName: string
  handler: (...args: any[]) => void
}) {
  const realtime = getAblyClient()
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

  try {
    channel.subscribe(params.eventName, params.handler)
  } catch (error) {
    console.warn(`[ably] subscribe failed for ${name}:${params.eventName}`, error)
    return () => {}
  }

  return () => {
    try {
      channel.unsubscribe(params.eventName, params.handler)
    } catch (error) {
      console.warn(`[ably] unsubscribe failed for ${name}:${params.eventName}`, error)
    }
  }
}

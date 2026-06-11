import Ably from 'ably'

let restClient: Ably.Rest | null = null

/** Client REST Ably compartit (server-side) per evitar connexions per publicació. */
export function getAblyRest(): Ably.Rest {
  const apiKey = process.env.ABLY_API_KEY
  if (!apiKey) {
    throw new Error('ABLY_API_KEY is not configured')
  }
  if (!restClient) {
    restClient = new Ably.Rest({ key: apiKey })
  }
  return restClient
}

export function hasAblyApiKey(): boolean {
  return Boolean(process.env.ABLY_API_KEY)
}

export async function publishAblyEvent(
  channelName: string,
  eventName: string,
  data: unknown
): Promise<void> {
  const rest = getAblyRest()
  await rest.channels.get(channelName).publish(eventName, data)
}

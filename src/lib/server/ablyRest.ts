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

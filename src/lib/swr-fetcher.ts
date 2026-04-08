import type { SWRConfiguration } from 'swr'

/**
 * Fetcher per defecte per crides GET a les rutes `/api` de l'app.
 * Llança Error si la resposta no és OK (perquè SWR marqui error).
 */
export async function swrJsonFetcher<T = unknown>(input: string): Promise<T> {
  const res = await fetch(input, { cache: 'no-store' })
  const json = (await res.json().catch(() => null)) as T | Record<string, unknown> | null

  if (!res.ok) {
    const msg =
      json &&
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `HTTP ${res.status}`
    throw new Error(msg)
  }

  return json as T
}

export const defaultSwrConfig: SWRConfiguration = {
  fetcher: swrJsonFetcher,
  dedupingInterval: 2000,
  revalidateOnFocus: true,
  shouldRetryOnError: false,
}

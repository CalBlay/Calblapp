type CachedEventDoc = {
  id: string
  title: string
  source: 'firestore-file' | 'firestore-link'
  url: string
  icon: string
  mimeType?: string
  kind?: string
  updatedAt?: string | number | null
  createdBy?: string | null
}

const TTL_MS = 60 * 1000

type CacheEntry = { docs: CachedEventDoc[]; expiresAt: number }

const cache = new Map<string, CacheEntry>()

export function eventDocumentsCacheKey(
  eventId: string,
  eventCode: string | null,
  prefixParam: string
) {
  return `${eventId}::${eventCode || ''}::${prefixParam}`
}

export function getCachedEventDocuments(key: string): CachedEventDoc[] | null {
  const entry = cache.get(key)
  if (!entry || Date.now() >= entry.expiresAt) {
    if (entry) cache.delete(key)
    return null
  }
  return entry.docs
}

export function setCachedEventDocuments(key: string, docs: CachedEventDoc[]) {
  cache.set(key, { docs, expiresAt: Date.now() + TTL_MS })
}

export function invalidateEventDocumentsCache(eventId?: string) {
  if (!eventId) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${eventId}::`)) cache.delete(key)
  }
}

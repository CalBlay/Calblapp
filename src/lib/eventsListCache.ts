import { revalidateTag } from 'next/cache'

export const EVENTS_LIST_CACHE_TAG = 'events-list-by-range-v1'

export function revalidateEventsListCache() {
  try {
    revalidateTag(EVENTS_LIST_CACHE_TAG)
  } catch (error) {
    console.warn('[eventsListCache] revalidateTag failed', error)
  }
}

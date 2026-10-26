// src/hooks/events/useEventDocuments.ts
'use client'

import { useEffect } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'

export type EventDoc = {
  id: string
  title: string
  name?: string
  fileName?: string
  label?: string
  kind?: string
  category?: string
  updatedAt?: string | number | null
  mimeType?: string
  source: 'calendar-attachment' | 'description-link' | 'firestore-file' | 'firestore-link'
  url: string
  previewUrl?: string
  icon: 'pdf' | 'doc' | 'sheet' | 'slide' | 'img' | 'video' | 'link'
  createdBy?: string | null
  validationStatus?: 'validated' | 'invalid'
}

function normalizeUrl(url?: string): string {
  if (!url) return ''

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  if (url.startsWith('drive:')) {
    const id = url.replace('drive:', '')
    return `https://drive.google.com/file/d/${id}/view`
  }

  if (url.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}${url}` : url
  }

  return ''
}

export function buildEventDocumentsUrl(
  eventId: string,
  eventCode?: string,
  fieldPrefix: string = 'file'
) {
  const qs = new URLSearchParams()
  if (eventCode) qs.set('eventCode', eventCode)
  if (fieldPrefix) qs.set('prefix', fieldPrefix)
  return `/api/events/${encodeURIComponent(eventId)}/documents?${qs.toString()}`
}

async function fetchEventDocuments(url: string): Promise<EventDoc[]> {
  const res = await fetch(url)
  const json = (await res.json()) as { docs?: EventDoc[]; error?: string }
  if (!res.ok) {
    throw new Error(json.error || 'No s\'han pogut carregar els documents.')
  }

  return Array.isArray(json.docs)
    ? json.docs
        .map((doc) => ({
          ...doc,
          url: normalizeUrl(doc.url),
        }))
        .filter((doc) => doc.url)
    : []
}

export function prefetchEventDocuments(
  eventId?: string,
  eventCode?: string,
  fieldPrefix: string = 'all'
) {
  if (!eventId) return
  const url = buildEventDocumentsUrl(eventId, eventCode, fieldPrefix)
  void globalMutate(url, fetchEventDocuments(url), { revalidate: false })
}

export default function useEventDocuments(
  eventId?: string,
  eventCode?: string,
  fieldPrefix: string = 'file',
  refreshToken: number = 0,
  enabled: boolean = true
) {
  const swrKey =
    enabled && (eventId || eventCode)
      ? buildEventDocumentsUrl(eventId ?? '__code__', eventCode, fieldPrefix)
      : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    swrKey,
    fetchEventDocuments,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )

  useEffect(() => {
    if (!swrKey || refreshToken === 0) return
    void mutate()
  }, [refreshToken, swrKey, mutate])

  return {
    docs: data ?? [],
    loading: isLoading && data === undefined,
    validating: isValidating,
    error: error ? String(error.message || error) : null,
    refresh: mutate,
  }
}

export function useEventDocumentsMany(
  eventIds: string[] = [],
  eventLabels: Record<string, string> = {},
  enabled: boolean = true
) {
  const normalizedIds = Array.from(
    new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))
  ).sort()
  const swrKey =
    enabled && normalizedIds.length > 1
      ? `event-documents-many:${encodeURIComponent(JSON.stringify({ normalizedIds, eventLabels }))}`
      : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    swrKey,
    async () => {
      const batches = await Promise.all(
        normalizedIds.map(async (eventId) => {
          const docs = await fetchEventDocuments(
            buildEventDocumentsUrl(eventId, undefined, 'all')
          )
          return docs.map((doc) => ({
            ...doc,
            id: `${eventId}:${doc.id}`,
            title: [eventLabels[eventId], doc.title].filter(Boolean).join(' · '),
          }))
        })
      )
      return Array.from(
        new Map(
          batches.flat().map((doc) => [`${doc.url}::${doc.title}`, doc] as const)
        ).values()
      )
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: true,
    }
  )

  return {
    docs: data ?? [],
    loading: isLoading && data === undefined,
    validating: isValidating,
    error: error ? String(error.message || error) : null,
    refresh: mutate,
  }
}

// src/hooks/events/useEventDocuments.ts
'use client'

import { useEffect, useState } from 'react'

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
  icon: 'pdf' | 'doc' | 'sheet' | 'slide' | 'img' | 'link'
}

function normalizeUrl(url?: string): string {
  if (!url) return ''

  // ja es una URL valida
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  // links Drive tipus "drive:ID"
  if (url.startsWith('drive:')) {
    const id = url.replace('drive:', '')
    return `https://drive.google.com/file/d/${id}/view`
  }

  // rutes relatives (ex. proxy SharePoint) -> les convertim a absolutes si podem
  if (url.startsWith('/')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}${url}` : url
  }

  // qualsevol altra cosa no obrible
  return ''
}

export default function useEventDocuments(
  eventId?: string,
  eventCode?: string,
  fieldPrefix: string = 'file',
  refreshToken: number = 0
) {
  const [docs, setDocs] = useState<EventDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId && !eventCode) return

    let alive = true
    setLoading(true)
    setError(null)

    const qs = new URLSearchParams()
    if (eventCode) qs.set('eventCode', eventCode)
    if (fieldPrefix) qs.set('prefix', fieldPrefix)

    fetch(`/api/events/${eventId ?? '__code__'}/documents?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return

        const cleanDocs: EventDoc[] = Array.isArray(j.docs)
          ? j.docs
              .map((d: EventDoc) => ({
                ...d,
                url: normalizeUrl(d.url),
              }))
              .filter((d) => d.url) // clau
          : []

        setDocs(cleanDocs)
      })
      .catch((e) => {
        if (alive) setError(String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [eventId, eventCode, fieldPrefix, refreshToken])

  return { docs, loading, error }
}

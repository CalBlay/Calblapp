'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import EventComandaWorkspace from '@/components/events/EventComandaWorkspace'
import type { EventComandaSummary } from '@/lib/eventComanda/types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function cleanEventName(summary?: string) {
  if (!summary) return 'Esdeveniment'
  let t = summary.replace(/^\s*[A-Z]\s*-\s*/i, '').trim()
  const stopIndex = t.search(/#|code/i)
  if (stopIndex > -1) t = t.substring(0, stopIndex).trim()
  return t || 'Esdeveniment'
}

export default function EventComandaPage() {
  const params = useParams()
  const eventId = String(params?.id || '').trim()

  const { data, error, isLoading, mutate } = useSWR<EventComandaSummary>(
    eventId ? `/api/events/${encodeURIComponent(eventId)}/comanda` : null,
    fetcher
  )

  const eventTitle = useMemo(() => {
    if (typeof window === 'undefined') return 'Esdeveniment'
    const raw = sessionStorage.getItem(`event-comanda-title:${eventId}`)
    return raw ? cleanEventName(raw) : 'Esdeveniment'
  }, [eventId])

  const eventMeta = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem(`event-comanda-meta:${eventId}`) || ''
  }, [eventId])

  if (!eventId) {
    return <p className="p-4 text-sm text-red-600">Esdeveniment no vàlid.</p>
  }

  if (error) {
    return <p className="p-4 text-sm text-red-600">No s&apos;ha pogut carregar la comanda.</p>
  }

  const summary: EventComandaSummary = data ?? {
    eventId,
    status: 'no_template',
    templateImportedAt: null,
    templateLineCount: 0,
    templateFamilyCount: 0,
    pendingReplenishmentCount: 0,
  }

  return (
    <EventComandaWorkspace
      eventId={eventId}
      eventTitle={eventTitle}
      eventMeta={eventMeta}
      summary={summary}
      loading={isLoading && !data}
      onRefresh={() => void mutate()}
    />
  )
}

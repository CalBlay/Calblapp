'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useParams, useSearchParams } from 'next/navigation'
import EventComandaWorkspace from '@/components/events/EventComandaWorkspace'
import EventOpsPanel from '@/components/events/EventOpsPanel'
import type { EventComandaSummary } from '@/lib/eventComanda/types'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  EVENTS_COMANDA_CREATE_PERM,
  canCreateEventComanda,
  canPrepareEventComanda,
  hasEventComandaPrepareAction,
  isEventsComandaPreparerOnlyView,
} from '@/lib/eventComandaPermissions'
import { useSession } from 'next-auth/react'

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
  const searchParams = useSearchParams()
  const eventId = String(params?.id || '').trim()
  const historyMode = searchParams.get('history') === '1'
  const returnTo = searchParams.get('returnTo') || '/menu/events'
  const { data: session } = useSession()
  const { hasAction, ready: permsReady, canEditPath } = useUiPermissions()
  const role = String(session?.user?.role || '').toLowerCase()
  const isAdminOrDireccio = role === 'admin' || role === 'direccio'
  const canEditEvents = canEditPath('/menu/events')
  const hasPrepareComandaAction = hasEventComandaPrepareAction(hasAction)
  const hasCreateComandaAction = hasAction(EVENTS_COMANDA_CREATE_PERM)

  const comandaPreparerOnly =
    permsReady &&
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction,
      hasCreateComandaAction,
      isAdminOrDireccio,
      canEditEvents,
    })

  const canCreateComanda =
    permsReady &&
    canCreateEventComanda({
      hasCreateComandaAction,
      isAdminOrDireccio,
      canEditEvents,
    })

  const canPrepareComanda =
    permsReady &&
    canPrepareEventComanda({
      hasPrepareComandaAction,
      isAdminOrDireccio,
    })

  const { data, error, isLoading, mutate } = useSWR<EventComandaSummary>(
    eventId
      ? `/api/events/${encodeURIComponent(eventId)}/comanda${historyMode ? '?history=1' : ''}`
      : null,
    fetcher
  )

  const eventTitle = useMemo(() => {
    const fromApi = data?.eventTitle?.trim()
    if (fromApi) return cleanEventName(fromApi)
    if (typeof window === 'undefined') return 'Esdeveniment'
    const raw = sessionStorage.getItem(`event-comanda-title:${eventId}`)
    return raw ? cleanEventName(raw) : 'Esdeveniment'
  }, [data?.eventTitle, eventId])

  const eventMeta = useMemo(() => {
    const fromApi = data?.eventMeta?.trim()
    if (fromApi) return fromApi
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem(`event-comanda-meta:${eventId}`) || ''
  }, [data?.eventMeta, eventId])

  const [opsOpen, setOpsOpen] = useState(false)
  const [opsRoomId, setOpsRoomId] = useState<string | null>(null)

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
  }

  return (
    <>
      <div className="px-3 pb-6 sm:px-4 lg:px-2 lg:pb-8 xl:px-0">
        <EventComandaWorkspace
        eventId={eventId}
        eventTitle={eventTitle}
        eventMeta={eventMeta}
        summary={summary}
        loading={isLoading && !data}
        onRefresh={() => void mutate()}
        comandaPreparerOnly={comandaPreparerOnly}
        comandaHistoryMode={historyMode}
        returnTo={returnTo}
        canCreateComanda={canCreateComanda}
        canPrepareComanda={canPrepareComanda}
        currentUserId={session?.user?.id}
        onOpenWarehouseChat={(_warehouseId, roomId) => {
          setOpsRoomId(roomId)
          setOpsOpen(true)
        }}
      />
      </div>

      <EventOpsPanel
        eventId={eventId}
        eventTitle={eventTitle}
        open={opsOpen}
        initialRoomId={opsRoomId}
        onOpenChange={setOpsOpen}
      />
    </>
  )
}

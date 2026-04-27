'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { CalendarDays } from 'lucide-react'

import useEvents from '@/hooks/events/useEvents'
import EventsDayGroup from '@/components/events/EventsDayGroup'
import EventMenuModal from '@/components/events/EventMenuModal'
import EventDocumentsSheet from '@/components/events/EventDocumentsSheet'
import EventAvisosReadOnlyModal from '@/components/events/EventAvisosReadOnlyModal'
import ModuleHeader from '@/components/layout/ModuleHeader'

const EventAuditExecutionModal = dynamic(
  () => import('@/components/events/EventAuditExecutionModal'),
  {
    ssr: false,
    loading: () => (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25"
        aria-busy="true"
        aria-label="Carregant auditoria"
      >
        <span className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-lg">
          Carregant auditoria…
        </span>
      </div>
    ),
  }
)
import FiltersBar, { FiltersState } from '@/components/layout/FiltersBar'

const normalize = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

type SessionUser = {
  id?: string
  role?: string
  department?: string
  name?: string
  commercialName?: string
}

type LnKey = 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'

type EventMenuData = {
  id: string
  summary: string
  start: string
  location?: string
  eventCode?: string | null
  responsableName?: string
  lnKey?: LnKey
  isResponsible?: boolean
  fincaId?: string | null
  fincaCode?: string | null
  pax?: number
  importAmount?: number
}

export default function EventsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()

  const role = String(session?.user?.role || '').toLowerCase()
  const isAdmin = role === 'admin' || role === 'direccio'
  const userDept = String((session?.user as SessionUser)?.department || 'total').toLowerCase()

  const scope: 'all' | 'mine' = role === 'treballador' ? 'mine' : 'all'
  const includeQuadrants = role === 'treballador'

  const initial: FiltersState = useMemo(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') }
  }, [])

  const [filters, setFilters] = useState<FiltersState>(initial)
  const [commercialFilterInitialized, setCommercialFilterInitialized] = useState(false)

  const fromISO = `${filters.start}T00:00:00.000Z`
  const toISO = `${filters.end}T23:59:59.999Z`

  const { events, loading, error, responsablesDetailed } =
    useEvents(userDept, fromISO, toISO, scope, includeQuadrants)

  const isAuth = sessionStatus === 'authenticated'
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data: channelsData } = useSWR(
    isAuth ? '/api/messaging/channels?scope=mine' : null,
    fetcher,
    { refreshInterval: isAuth ? 15000 : 0 }
  )

  const eventChatUnread = useMemo(() => {
    const map = new Map<string, number>()
    const channels = Array.isArray(channelsData?.channels) ? channelsData.channels : []
    channels.forEach((c: any) => {
      if (c?.source !== 'events') return
      const eventId = String(c?.eventId || '').trim()
      if (!eventId) return
      const unread = Number(c?.unreadCount || 0)
      map.set(eventId, Number.isNaN(unread) ? 0 : unread)
    })
    return map
  }, [channelsData])

  const eventChatVisible = useMemo(() => {
    const set = new Set<string>()
    const channels = Array.isArray(channelsData?.channels) ? channelsData.channels : []
    channels.forEach((c: any) => {
      if (c?.source !== 'events') return
      const eventId = String(c?.eventId || '').trim()
      if (eventId) set.add(eventId)
    })
    return set
  }, [channelsData])

  const [isMenuOpen, setMenuOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<EventMenuData | null>(null)
  const [auditEvent, setAuditEvent] = useState<EventMenuData | null>(null)
  const [isAuditOpen, setAuditOpen] = useState(false)

  const [docsEvent, setDocsEvent] = useState<{
    eventId: string
    eventCode?: string | null
  } | null>(null)
  const docsClosedRef = useRef<{ eventId: string; ts: number } | null>(null)
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [suppressMenuInteraction, setSuppressMenuInteraction] = useState(false)

  const [isAvisosOpen, setAvisosOpen] = useState(false)
  const [avisosEventCode, setAvisosEventCode] = useState<string | null>(null)
  const [avisosState, setAvisosState] = useState<Record<string, { hasAvisos: boolean; lastAvisoDate?: string }>>({})

  let filteredEvents = events

  if (filters.ln && filters.ln !== '__all__') {
    filteredEvents = filteredEvents.filter(ev => ev.lnKey === filters.ln)
  }

  if (filters.responsable && filters.responsable !== '__all__') {
    filteredEvents = filteredEvents.filter(ev => {
      const evResps = [ev.responsableName || '']
        .join(',')
        .split(',')
        .map(r => normalize(r))
        .filter(Boolean)
      return evResps.includes(normalize(filters.responsable))
    })
  }

  if (filters.commercial && filters.commercial !== '__all__') {
    filteredEvents = filteredEvents.filter(ev => normalize(ev.commercial) === normalize(filters.commercial))
  }

  if (filters.location && filters.location !== '__all__') {
    filteredEvents = filteredEvents.filter(
      ev => normalize(ev.locationShort) === normalize(filters.location)
    )
  }

  const enhancedEvents = filteredEvents.map(ev => {
    const code = ev.eventCode || ev.id
    const hasAvisos = code
      ? (avisosState[code]?.hasAvisos ?? Boolean(ev.lastAviso))
      : Boolean(ev.lastAviso)

    return {
      ...ev,
      chatUnread: eventChatUnread.get(String(ev.id)) || 0,
      canChat: eventChatVisible.has(String(ev.id)),
      lastAviso: hasAvisos
        ? ev.lastAviso || {
            content: '',
            department: '',
            createdAt: avisosState[code || '']?.lastAvisoDate || new Date().toISOString(),
          }
        : null,
    }
  })

  const grouped = enhancedEvents.reduce<Record<string, typeof enhancedEvents>>((acc, ev) => {
    const day = ev.start.slice(0, 10)
    acc[day] ||= []
    acc[day].push(ev)
    return acc
  }, {})

  const handleEventClick = (ev: any, mode: 'menu' | 'avisos' = 'menu') => {
    if (mode === 'avisos') {
      const codeForAvisos = ev.eventCode || (ev.id ? String(ev.id) : null)
      setAvisosEventCode(codeForAvisos)
      setAvisosOpen(true)
      return
    }

    setSelectedEvent({
      id: String(ev.id),
      summary: ev.summary,
      start: ev.start,
      location: ev.location || '',
      responsableName: ev.responsableName,
      lnKey: ev.lnKey,
      isResponsible: ev.isResponsible,
      fincaId: ev.fincaId ?? null,
      fincaCode: ev.fincaCode ?? null,
      eventCode: ev.eventCode ?? null,
      pax: ev.pax ?? 0,
      importAmount: ev.importAmount ?? 0,
    })

    setMenuOpen(true)
  }

  const handleEventChat = async (ev: any) => {
    const code = String(ev?.eventCode || '').trim()
    const commercial = String(ev?.commercial || '').trim()
    if (!code || !commercial) return
    try {
      const res = await fetch('/api/messaging/events/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: String(ev.id) }),
      })
      if (!res.ok) return
      const json = await res.json()
      if (!json?.channelId) return
      const returnTo = encodeURIComponent(`/menu/events?start=${filters.start}&end=${filters.end}`)
      const url = `/menu/missatgeria?channel=${json.channelId}&event=1&returnTo=${returnTo}`
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener')
        return
      }
      router.push(url)
    } catch {
      // silent
    }
  }

  const userForModal = {
    id: (session?.user as SessionUser)?.id,
    role: (session?.user as SessionUser)?.role,
    department: (session?.user as SessionUser)?.department,
    name: (session?.user as SessionUser)?.name,
  }

  useEffect(() => {
    if (commercialFilterInitialized) return
    if (role !== 'comercial') return
    const user = session?.user as SessionUser | undefined
    const commercialName = String(user?.commercialName || user?.name || '').trim()
    if (!commercialName) return
    setFilters((prev) => ({ ...prev, commercial: commercialName }))
    setCommercialFilterInitialized(true)
  }, [commercialFilterInitialized, role, session?.user])

  useEffect(() => {
    setAvisosState(prev => {
      const next = { ...prev }
      events.forEach(ev => {
        const code = ev.eventCode || ev.id
        if (!code) return
        if (!(code in next)) {
          next[code] = { hasAvisos: Boolean(ev.lastAviso), lastAvisoDate: ev.lastAviso?.createdAt }
        }
      })
      return next
    })
  }, [events])

  const handleAvisosStateChange = useCallback(
    (info: { eventCode: string | null; hasAvisos: boolean; lastAvisoDate?: string }) => {
      if (!info.eventCode) return
      const eventCode = info.eventCode
      setAvisosState(prev => {
        const current = prev[eventCode]
        const next = { hasAvisos: info.hasAvisos, lastAvisoDate: info.lastAvisoDate }
        if (current && current.hasAvisos === next.hasAvisos && current.lastAvisoDate === next.lastAvisoDate) {
          return prev
        }
        return { ...prev, [eventCode]: next }
      })
    },
    []
  )

  const openDocuments = (data: { eventId: string; eventCode?: string | null }) => {
    if (suppressMenuInteraction) return
    const now = Date.now()
    if (
      docsClosedRef.current &&
      docsClosedRef.current.eventId === data.eventId &&
      now - docsClosedRef.current.ts < 350
    ) {
      return
    }
    setDocsEvent(data)
  }

  const closeDocuments = () => {
    if (docsEvent) {
      docsClosedRef.current = { eventId: docsEvent.eventId, ts: Date.now() }
    }
    setDocsEvent(null)
    setSuppressMenuInteraction(true)
    if (suppressTimerRef.current) {
      clearTimeout(suppressTimerRef.current)
    }
    suppressTimerRef.current = setTimeout(() => {
      setSuppressMenuInteraction(false)
    }, 400)
  }

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current)
      }
    }
  }, [])

  const openAuditExecution = useCallback(() => {
    if (!selectedEvent) return
    setAuditEvent(selectedEvent)
    setMenuOpen(false)
    queueMicrotask(() => setAuditOpen(true))
  }, [selectedEvent])

  return (
    <div className={`space-y-5 px-4 pb-8 ${suppressMenuInteraction ? 'pointer-events-none select-none' : ''}`}>
      <ModuleHeader
        icon={<CalendarDays className="h-6 w-6 text-indigo-600" />}
        title="Esdeveniments"
        subtitle="Consulta i gestiona els esdeveniments"
      />

      <FiltersBar
        filters={filters}
        setFilters={f => setFilters(prev => ({ ...prev, ...f }))}
        visibleFilters={[]}
        hiddenFilters={['ln', 'responsable', 'location']}
        lnOptions={Array.from(
          new Set(
            filteredEvents
              .map(e => e.lnKey)
              .filter((value): value is LnKey => Boolean(value))
          )
        ).sort()}
        responsables={responsablesDetailed?.map(r => r.name).filter(Boolean) ?? []}
        commercials={Array.from(
          new Set(
            events
              .map(e => e.commercial)
              .filter((value): value is string => Boolean(value))
          )
        ).sort((a, b) => a.localeCompare(b))}
        locations={Array.from(
          new Set(
            filteredEvents
              .map(e => e.locationShort || e.location)
              .filter((value): value is string => Boolean(value))
          )
        ).sort()}
      />

      <div>
        {loading && <p className="text-gray-500">Carregant esdeveniments...</p>}
        {error && <p className="text-red-600">{String(error)}</p>}

        {!loading && !error && filteredEvents.length === 0 && (
          <p>No hi ha esdeveniments per mostrar.</p>
        )}

        {!loading && !error && filteredEvents.length > 0 && (
          <div className="space-y-4">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, evs]) => (
                <EventsDayGroup
                  key={day}
                  date={day}
                  events={evs}
                  onEventClick={handleEventClick}
                  onEventChat={handleEventChat}
                  isAdmin={isAdmin}
                />
              ))}
          </div>
        )}
      </div>

      {isMenuOpen && selectedEvent && (
        <EventMenuModal
          event={selectedEvent}
          user={userForModal}
          onClose={() => setMenuOpen(false)}
          onOpenAuditExecution={openAuditExecution}
          onAvisosStateChange={handleAvisosStateChange}
          suppressMenuInteraction={suppressMenuInteraction}
        />
      )}

      {auditEvent && (
        <EventAuditExecutionModal
          open={isAuditOpen}
          onClose={() => {
            setAuditOpen(false)
            setAuditEvent(null)
          }}
          event={{
            id: auditEvent.id,
            summary: auditEvent.summary,
            start: auditEvent.start,
            eventCode: auditEvent.eventCode || undefined,
            location: auditEvent.location,
          }}
          user={{ department: userForModal.department, role: userForModal.role, name: userForModal.name }}
        />
      )}

      {docsEvent && (
        <EventDocumentsSheet
          eventId={docsEvent.eventId}
          eventCode={docsEvent.eventCode}
          open
          onOpenChange={closeDocuments}
        />
      )}

      <EventAvisosReadOnlyModal
        open={isAvisosOpen}
        onClose={() => setAvisosOpen(false)}
        eventCode={avisosEventCode}
        onAvisosStateChange={handleAvisosStateChange}
      />
    </div>
  )
}

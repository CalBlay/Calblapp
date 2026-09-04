'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { formatDateOnly } from '@/lib/date-format'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { CalendarDays } from 'lucide-react'

import useEvents from '@/hooks/events/useEvents'
import type { EventData } from '@/hooks/events/useEvents'
import EventsDayGroup from '@/components/events/EventsDayGroup'
import EventOpsPanel from '@/components/events/EventOpsPanel'
import EventMenuModal from '@/components/events/EventMenuModal'
import EventDocumentsSheet from '@/components/events/EventDocumentsSheet'
import EventAvisosReadOnlyModal from '@/components/events/EventAvisosReadOnlyModal'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { isProductionWorker, normalizeDept } from '@/lib/accessControl'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import EventNotificationsBell from './components/EventNotificationsBell'
import {
  EVENTS_COMANDA_CREATE_PERM,
  hasEventComandaPrepareAction,
  isEventsComandaPreparerOnlyView,
} from '@/lib/eventComandaPermissions'

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
import EventsFiltersBar from '@/components/events/EventsFiltersBar'
import type { FiltersState } from '@/components/layout/FiltersBar'

const normalize = (s?: string | null) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

const departmentDefaultLn = (department?: string | null): LnKey | undefined => {
  const normalized = normalizeDept(department)
  if (normalized === 'empresa') return 'empresa'
  if (normalized === 'casaments') return 'casaments'
  if (normalized === 'foodlovers') return 'foodlovers'
  if (normalized === 'agenda') return 'agenda'
  return undefined
}

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
  commercialInternal?: string | null
  isResponsible?: boolean
  fincaId?: string | null
  fincaCode?: string | null
  pax?: number
  importAmount?: number
}

type MessagingChannel = {
  source?: string | null
  eventId?: string | number | null
  unreadCount?: number | null
}

type MessagingChannelsResponse = {
  channels?: MessagingChannel[]
}

type EnhancedEvent = EventData & {
  chatUnread: number
  canChat: boolean
}

export default function EventsPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { hasAction, ready: permsReady, canViewPath, canEditPath } = useUiPermissions()

  const role = String(session?.user?.role || '').toLowerCase()
  const isAdmin = role === 'admin' || role === 'direccio'
  const comandaPreparerOnly =
    permsReady &&
    isEventsComandaPreparerOnlyView({
      hasPrepareComandaAction: hasEventComandaPrepareAction(hasAction),
      hasCreateComandaAction: hasAction(EVENTS_COMANDA_CREATE_PERM),
      isAdminOrDireccio: isAdmin,
      canEditEvents: canEditPath('/menu/events'),
    })

  const userDept = String((session?.user as SessionUser)?.department || 'total').toLowerCase()
  const defaultLn = departmentDefaultLn((session?.user as SessionUser)?.department)
  const isCasamentsCommercialDept = normalize(
    String((session?.user as SessionUser)?.department || '')
  ).includes('casament')
  const productionWorker = isProductionWorker({
    role: (session?.user as SessionUser)?.role,
    department: (session?.user as SessionUser)?.department,
  })

  const hasFullEventsAccess =
    permsReady && canViewPath('/menu/events') && canEditPath('/menu/events')
  const scope: 'all' | 'mine' =
    role === 'treballador' && !productionWorker && !hasFullEventsAccess ? 'mine' : 'all'
  const includeQuadrants = role === 'treballador' && !productionWorker

  const initial: FiltersState = useMemo(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd'), ln: defaultLn }
  }, [defaultLn])

  const [filters, setFilters] = useState<FiltersState>(initial)
  const [filterResetSignal, setFilterResetSignal] = useState(0)
  const [departmentFilterInitialized, setDepartmentFilterInitialized] = useState(false)
  const [commercialFilterInitialized, setCommercialFilterInitialized] = useState(false)
  const [preparerHistoryMode, setPreparerHistoryMode] = useState(
    () => searchParams?.get('history') === '1'
  )

  useEffect(() => {
    if (departmentFilterInitialized || sessionStatus === 'loading') return
    setFilters((prev) => ({ ...prev, ln: defaultLn }))
    setDepartmentFilterInitialized(true)
  }, [defaultLn, departmentFilterInitialized, sessionStatus])

  useEffect(() => {
    setPreparerHistoryMode(searchParams?.get('history') === '1')
  }, [searchParams])

  const fromISO = `${filters.start}T00:00:00.000Z`
  const toISO = `${filters.end}T23:59:59.999Z`

  const { events, loading, error, responsablesDetailed } =
    useEvents(userDept, fromISO, toISO, scope, includeQuadrants)

  const isAuth = sessionStatus === 'authenticated'
  const fetcher = (url: string) => fetch(url).then(r => r.json())
  const { data: channelsData } = useSWR<MessagingChannelsResponse>(
    isAuth ? '/api/messaging/channels?scope=mine' : null,
    fetcher,
    { refreshInterval: isAuth ? 90000 : 0 }
  )

  const eventChatUnread = useMemo(() => {
    const map = new Map<string, number>()
    const channels = Array.isArray(channelsData?.channels) ? channelsData.channels : []
    channels.forEach((c) => {
      if (c?.source !== 'events' && c?.source !== 'event_comanda') return
      const eventId = String(c?.eventId || '').trim()
      if (!eventId) return
      const unread = Number(c?.unreadCount || 0)
      const safeUnread = Number.isNaN(unread) ? 0 : unread
      map.set(eventId, (map.get(eventId) || 0) + safeUnread)
    })
    return map
  }, [channelsData])

  const eventChatVisible = useMemo(() => {
    const set = new Set<string>()
    const channels = Array.isArray(channelsData?.channels) ? channelsData.channels : []
    channels.forEach((c) => {
      if (c?.source !== 'events' && c?.source !== 'event_comanda') return
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
  const [opsPanel, setOpsPanel] = useState<{
    eventId: string
    eventTitle: string
    initialRoomId?: string | null
    initialChannelId?: string | null
  } | null>(null)

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

  const eventIdsForWarehouseFilter = useMemo(
    () =>
      comandaPreparerOnly
        ? filteredEvents.map((ev) => String(ev.id)).filter(Boolean)
        : [],
    [comandaPreparerOnly, filteredEvents]
  )

  const { data: warehouseComandaData, isLoading: warehouseComandaLoading } = useSWR<{
    events?: EventData[]
    eventIds?: string[]
  }>(
    comandaPreparerOnly
      ? ['event-comanda-warehouse-events', filters.start, filters.end, preparerHistoryMode]
      : null,
    async ([, start, end, history]) => {
      const res = await fetch('/api/event-comanda/warehouse-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, history: Boolean(history) }),
      })
      if (!res.ok) throw new Error('warehouse-events load failed')
      return res.json()
    },
    { revalidateOnFocus: true }
  )

  const { data: warehouseEventsData, isLoading: warehouseEventsLoading } = useSWR<{
    eventIds?: string[]
  }>(
    !comandaPreparerOnly && eventIdsForWarehouseFilter.length
      ? ['event-comanda-warehouse-events-legacy', eventIdsForWarehouseFilter]
      : null,
    async ([, eventIds]) => {
      const res = await fetch('/api/event-comanda/warehouse-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds }),
      })
      if (!res.ok) throw new Error('warehouse-events filter failed')
      return res.json()
    },
    { revalidateOnFocus: false }
  )

  const warehouseEventIdSet = useMemo(() => {
    if (comandaPreparerOnly) return null
    const ids = warehouseEventsData?.eventIds
    if (!Array.isArray(ids)) return null
    return new Set(ids.map((id) => String(id)))
  }, [comandaPreparerOnly, warehouseEventsData])

  if (comandaPreparerOnly) {
    filteredEvents = (warehouseComandaData?.events || []) as EventData[]
  } else if (warehouseEventIdSet) {
    filteredEvents = filteredEvents.filter((ev) => warehouseEventIdSet.has(String(ev.id)))
  }

  const enhancedEvents = filteredEvents.map((ev): EnhancedEvent => {
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
    const day = ev.day || ev.start.slice(0, 10)
    acc[day] ||= []
    acc[day].push(ev)
    return acc
  }, {})

  const handleEventClick = (ev: EnhancedEvent, mode: 'menu' | 'avisos' = 'menu') => {
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
      commercialInternal: ev.commercialInternal ?? null,
      isResponsible: ev.isResponsible,
      fincaId: ev.fincaId ?? null,
      fincaCode: ev.fincaCode ?? null,
      eventCode: ev.eventCode ?? null,
      pax: ev.pax ?? 0,
      importAmount: ev.importAmount ?? 0,
    })

    setMenuOpen(true)
  }

  const handleEventChat = (ev: EnhancedEvent) => {
    const title = String(ev.summary || ev.name || 'Esdeveniment').trim()
    setOpsPanel({
      eventId: String(ev.id),
      eventTitle: title,
      initialRoomId: null,
      initialChannelId: `event_${String(ev.id)}`,
    })
  }

  const handleEventComanda = (ev: EnhancedEvent) => {
    const title = ev.summary || ev.name || 'Esdeveniment'
    const meta = [
      formatDateOnly(ev.start?.slice(0, 10)),
      ev.horaInici,
      ev.locationShort || ev.location,
    ]
      .filter(Boolean)
      .join(' · ')

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`event-comanda-title:${ev.id}`, title)
      sessionStorage.setItem(`event-comanda-meta:${ev.id}`, meta)
    }

    const historySuffix = preparerHistoryMode ? '&history=1' : ''
    const returnTo = encodeURIComponent(
      `/menu/events?start=${filters.start}&end=${filters.end}${historySuffix}`
    )
    router.push(
      `/menu/events/${encodeURIComponent(String(ev.id))}/comanda?returnTo=${returnTo}${historySuffix}`
    )
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
    const displayName = String(user?.commercialName || user?.name || '').trim()
    if (!displayName) return
    if (isCasamentsCommercialDept) {
      setFilters((prev) => ({
        ...prev,
        responsable: displayName,
        commercial: '__all__',
      }))
    } else {
      setFilters((prev) => ({
        ...prev,
        commercial: displayName,
        responsable: '__all__',
      }))
    }
    setCommercialFilterInitialized(true)
  }, [commercialFilterInitialized, role, session?.user, isCasamentsCommercialDept])

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

  const _openDocuments = (data: { eventId: string; eventCode?: string | null }) => {
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

  const responsablesForFilter = useMemo(() => {
    const fromApi = responsablesDetailed?.map((r) => r.name).filter(Boolean) ?? []
    const fromEvents = new Set<string>()
    for (const ev of events) {
      const raw = String(ev.responsableName || '').trim()
      if (!raw) continue
      for (const part of raw.split(',')) {
        const t = part.trim()
        if (t) fromEvents.add(t)
      }
    }
    return Array.from(new Set([...fromApi, ...fromEvents])).sort((a, b) =>
      a.localeCompare(b, 'ca')
    )
  }, [events, responsablesDetailed])

  const lnOptionsForFilter = useMemo(
    () =>
      Array.from(
        new Set(events.map((e) => e.lnKey).filter((value): value is LnKey => Boolean(value)))
      ).sort(),
    [events]
  )

  const commercialsForFilter = useMemo(
    () =>
      Array.from(
        new Set(events.map((e) => e.commercial).filter((value): value is string => Boolean(value)))
      ).sort((a, b) => a.localeCompare(b, 'ca')),
    [events]
  )

  const locationsForFilter = useMemo(
    () =>
      Array.from(
        new Set(
          events
            .map((e) => e.locationShort || e.location)
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b, 'ca')),
    [events]
  )

  const handleHistoryModeChange = useCallback(
    (next: boolean) => {
      setPreparerHistoryMode(next)
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (next) {
        params.set('history', '1')
      } else {
        params.delete('history')
      }
      const query = params.toString()
      router.replace(query ? `/menu/events?${query}` : '/menu/events', { scroll: false })
    },
    [router, searchParams]
  )

  const handleFiltersReset = useCallback(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    setFilters({
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      mode: 'week',
      ln: defaultLn,
      responsable: undefined,
      commercial: undefined,
      location: undefined,
    })
    setFilterResetSignal((value) => value + 1)
    setCommercialFilterInitialized(false)
    setPreparerHistoryMode(false)
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.delete('history')
    const query = params.toString()
    router.replace(query ? `/menu/events?${query}` : '/menu/events', { scroll: false })
  }, [defaultLn, router, searchParams])

  const visibleEventCount = comandaPreparerOnly
    ? warehouseComandaLoading
      ? 0
      : filteredEvents.length
    : filteredEvents.length

  const eventsListLoading = comandaPreparerOnly
    ? warehouseComandaLoading
    : loading || (eventIdsForWarehouseFilter.length > 0 && warehouseEventsLoading)

  return (
    <div
      className={`flex w-full max-w-none flex-col gap-4 px-3 pb-6 sm:px-4 lg:gap-3 lg:px-2 lg:pb-8 xl:px-0 ${suppressMenuInteraction ? 'pointer-events-none select-none' : ''}`}
    >
      <ModuleHeader
        icon={<CalendarDays className="h-6 w-6 text-indigo-600" />}
        title="Esdeveniments"
        subtitle={
          comandaPreparerOnly
            ? preparerHistoryMode
              ? 'Historial de comandes enviades'
              : 'Comandes del magatzem assignat'
            : 'Consulta i gestiona els esdeveniments'
        }
        actions={
          <>
            <EventNotificationsBell />
            {!eventsListLoading && !error && visibleEventCount > 0 ? (
              <span className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-bold text-white">
                {visibleEventCount} visibles
              </span>
            ) : null}
          </>
        }
      />

      <EventsFiltersBar
        filters={filters}
        setFilters={(next) => setFilters((prev) => ({ ...prev, ...next }))}
        onReset={handleFiltersReset}
        resetSignal={filterResetSignal}
        lnOptions={lnOptionsForFilter}
        responsables={responsablesForFilter}
        commercials={commercialsForFilter}
        locations={locationsForFilter}
        minimal={comandaPreparerOnly}
        historyMode={preparerHistoryMode}
        onHistoryModeChange={comandaPreparerOnly ? handleHistoryModeChange : undefined}
      />

      <div>
        {eventsListLoading && <p className="text-gray-500">Carregant esdeveniments...</p>}
        {error && <p className="text-red-600">{String(error)}</p>}

        {!eventsListLoading && !error && visibleEventCount === 0 && (
          <p>
            {comandaPreparerOnly
              ? preparerHistoryMode
                ? 'No hi ha comandes enviades al teu magatzem assignat en aquest període.'
                : 'No hi ha esdeveniments amb comanda al teu magatzem assignat.'
              : 'No hi ha esdeveniments per mostrar.'}
          </p>
        )}

        {!eventsListLoading && !error && visibleEventCount > 0 && (
          <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:rounded-xl">
            <div className="space-y-4 p-3 sm:space-y-5 sm:p-4 lg:space-y-3 lg:p-3 xl:p-4">
              {Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([day, evs]) => (
                  <EventsDayGroup
                    key={day}
                    date={day}
                    events={evs}
                    onEventClick={comandaPreparerOnly ? undefined : handleEventClick}
                    onEventChat={handleEventChat}
                    onEventComanda={handleEventComanda}
                    isAdmin={isAdmin}
                    comandaOnly={comandaPreparerOnly}
                  />
                ))}
            </div>
          </section>
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
            lnKey: auditEvent.lnKey,
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

      {opsPanel ? (
        <EventOpsPanel
          eventId={opsPanel.eventId}
          eventTitle={opsPanel.eventTitle}
          open
          initialRoomId={opsPanel.initialRoomId}
          initialChannelId={opsPanel.initialChannelId}
          onOpenChange={(open) => {
            if (!open) setOpsPanel(null)
          }}
        />
      ) : null}
    </div>
  )
}

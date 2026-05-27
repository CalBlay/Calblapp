'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import { normalizeStatus } from '@/utils/normalize'

export interface EventData {
  id: string
  summary: string
  start: string
  end: string | null
  day: string
  occurrenceKey?: string
  location: string
  pax: number
  importAmount?: number
  state: 'pending' | 'draft' | 'confirmed'
  name: string
  eventCode: string | null
  codeConfirmed?: boolean
  codeMatchScore?: number | null
  commercial?: string | null
  commercialInternal?: string | null
  locationShort?: string
  mapsUrl?: string
  htmlLink?: string | null
  responsableName?: string
  lnKey?: 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'
  lnLabel?: string
  fincaId?: string | null
  fincaCode?: string | null
  isResponsible?: boolean
  responsable?: string
  conductors?: string[]
  treballadors?: string[]
  horaInici?: string
  lastAviso?: {
    content: string
    department: string
    createdAt: string
  } | null
}

interface EventPayload {
  id: string
  summary: string
  start: string
  end?: string
  day?: string
  occurrenceKey?: string
  location?: string
  pax?: number
  importAmount?: number
  state?: string
  status?: string
  eventCode?: string
  code?: string
  codeConfirmed?: boolean
  codeMatchScore?: number | null
  commercial?: string | null
  commercialInternal?: string | null
  responsableName?: string
  responsable?: { name?: string }
  LN?: string
  lnKey?: string
  lnLabel?: string
  HoraInici?: string
  horaInici?: string
  Hora?: string
  hora?: string
  lastAviso?: {
    content: string
    department: string
    createdAt: string
  } | null
  fincaId?: string | null
  fincaCode?: string | null
  [key: string]: unknown
}

type GroupedEvents = Record<string, EventData[]>
type TotalPerDay = Record<string, number>

export interface ResponsableDetailed {
  name: string
  department: string
}

const computeLocationShort = (full = '') => {
  if (!full) return ''
  const cut = full.split(/[,\|\.]/)[0]?.trim() || full.trim()
  return cut.length > 30 ? `${cut.slice(0, 30)}...` : cut
}

const computeMapsUrl = (location = '') =>
  location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
    : undefined

const normalizeCode = (raw?: string | number | null) =>
  String(raw ?? '').replace(/^#/, '').trim().toUpperCase()

type EventsApiPayload = {
  events?: EventPayload[]
  responsables?: string[]
  responsablesDetailed?: ResponsableDetailed[]
}

type EventsResult = {
  events: EventData[]
  groupedEvents: GroupedEvents
  totalPerDay: TotalPerDay
  responsables: string[]
  responsablesDetailed: ResponsableDetailed[]
}

const EMPTY_RESULT: EventsResult = {
  events: [],
  groupedEvents: {},
  totalPerDay: {},
  responsables: [],
  responsablesDetailed: [],
}

const eventsFetcher = async (url: string): Promise<EventsResult> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = (await res.json()) as EventsApiPayload
  const eventsFromPayload = payload?.events || []

  const flat: EventData[] = eventsFromPayload.map((ev) => {
    const location = ev.location || ''
    let eventCode = ev.eventCode || ev.code || null

    if (!eventCode && ev.summary) {
      const match = ev.summary.match(/([A-Z]{1,3}\d{5,7})/i)
      if (match) eventCode = match[1].toUpperCase()
    }

    const pax = Number(ev.pax ?? 0)
    const lnRaw = String(ev.LN || ev.lnKey || 'altres').toLowerCase()
    const lnKeys = ['empresa', 'casaments', 'foodlovers', 'agenda', 'altres'] as const
    const lnKey = (lnKeys.includes(lnRaw as (typeof lnKeys)[number])
      ? lnRaw
      : 'altres') as NonNullable<EventData['lnKey']>

    return {
      ...ev,
      name: ev.summary,
      pax,
      location,
      day: String(ev.day || ev.start.slice(0, 10)),
      occurrenceKey: ev.occurrenceKey || undefined,
      locationShort: computeLocationShort(location),
      mapsUrl: computeMapsUrl(location),
      state: normalizeStatus(ev.state || ev.status),
      eventCode: eventCode ? normalizeCode(eventCode) : null,
      commercial: ev.commercial ?? null,
      commercialInternal: ev.commercialInternal ?? null,
      lastAviso: ev.lastAviso ?? null,
      codeConfirmed: ev.codeConfirmed ?? undefined,
      codeMatchScore: ev.codeMatchScore ?? undefined,
      responsable: ev.responsableName || ev.responsable?.name,
      responsableName: ev.responsableName || ev.responsable?.name || '',
      conductors: [],
      treballadors: [],
      lnKey,
      lnLabel: String(ev.LN || ev.lnLabel || 'Altres'),
      fincaId: ev.fincaId ?? null,
      fincaCode: ev.fincaCode ?? null,
      horaInici:
        String(ev.HoraInici || ev.horaInici || ev.Hora || ev.hora || '').slice(0, 5) ||
        undefined,
    } as EventData
  })

  const totals: TotalPerDay = {}
  const grouped: GroupedEvents = {}
  flat.forEach((ev) => {
    totals[ev.day] = (totals[ev.day] || 0) + (ev.pax || 0)
    if (!grouped[ev.day]) grouped[ev.day] = []
    grouped[ev.day].push(ev)
  })

  return {
    events: flat,
    groupedEvents: grouped,
    totalPerDay: totals,
    responsables: payload?.responsables || [],
    responsablesDetailed: payload?.responsablesDetailed || [],
  }
}

export default function useEvents(
  department: string,
  fromISO: string,
  toISO: string,
  scope?: 'all' | 'mine',
  _includeQuadrants?: boolean
) {
  const ready = Boolean(department && fromISO && toISO)
  const url = useMemo(() => {
    if (!ready) return null
    const qs = new URLSearchParams({
      start: fromISO.slice(0, 10),
      end: toISO.slice(0, 10),
      department,
    })
    if (scope) qs.set('scope', scope)
    return `/api/events/list?${qs.toString()}`
  }, [ready, department, fromISO, toISO, scope])

  const { data, error, isLoading } = useSWR<EventsResult>(url, eventsFetcher, {
    /**
     * El servidor cacheja amb unstable_cache (EVENTS_LIST_REVALIDATE_SEC),
     * aixi que aqui dedupliquem i revalidem nomes en ocasions clau:
     * focus de finestra i reconnexio. Evitem fetches innecessaris.
     */
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const result = data ?? EMPTY_RESULT

  const lnOptions = useMemo(() => {
    const set = new Set<string>()
    result.events.forEach((event) => {
      if (event.lnLabel) set.add(event.lnLabel)
    })
    const order = ['Empresa', 'Casaments', 'Foodlovers', 'Agenda', 'Altres']
    return Array.from(set).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }, [result.events])

  return {
    events: result.events,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    groupedEvents: result.groupedEvents,
    totalPerDay: result.totalPerDay,
    responsables: result.responsables,
    responsablesDetailed: result.responsablesDetailed,
    lnOptions,
  }
}

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { normalizeStatus } from '@/utils/normalize'

export interface EventData {
  id: string
  summary: string
  start: string
  end: string | null
  day: string
  location: string
  pax: number
  importAmount?: number
  state: 'pending' | 'draft' | 'confirmed'
  name: string
  eventCode: string | null
  codeConfirmed?: boolean
  codeMatchScore?: number | null
  commercial?: string | null
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

export default function useEvents(
  department: string,
  fromISO: string,
  toISO: string,
  scope?: 'all' | 'mine',
  _includeQuadrants?: boolean
) {
  const [events, setEvents] = useState<EventData[]>([])
  const [groupedEvents, setGroupedEvents] = useState<GroupedEvents>({})
  const [totalPerDay, setTotalPerDay] = useState<TotalPerDay>({})
  const [responsables, setResponsables] = useState<string[]>([])
  const [responsablesDetailed, setResponsablesDetailed] = useState<ResponsableDetailed[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!fromISO || !toISO || !department) return

      setLoading(true)
      setError(null)

      try {
        const qs = new URLSearchParams({
          start: fromISO.slice(0, 10),
          end: toISO.slice(0, 10),
          department,
        })
        if (scope) qs.set('scope', scope)

        const res = await fetch(`/api/events/list?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        })
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`)
        }

        const payload = await res.json()
        const eventsFromPayload = (payload?.events || []) as EventPayload[]

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
            day: ev.start.slice(0, 10),
            locationShort: computeLocationShort(location),
            mapsUrl: computeMapsUrl(location),
            state: normalizeStatus(ev.state || ev.status),
            eventCode: eventCode ? normalizeCode(eventCode) : null,
            commercial: ev.commercial ?? null,
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

        setEvents(flat)
        setTotalPerDay(totals)
        setGroupedEvents(grouped)
        setResponsables(payload?.responsables || [])
        setResponsablesDetailed(payload?.responsablesDetailed || [])
      } catch (err: unknown) {
        const aborted =
          (err instanceof DOMException || err instanceof Error) && err.name === 'AbortError'
        if (aborted) return
        setError(err instanceof Error ? err.message : 'Error carregant esdeveniments')
      } finally {
        setLoading(false)
      }
    },
    [fromISO, toISO, scope, department]
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const lnOptions = useMemo(() => {
    const set = new Set<string>()
    events.forEach((event) => {
      if (event.lnLabel) set.add(event.lnLabel)
    })
    const order = ['Empresa', 'Casaments', 'Foodlovers', 'Agenda', 'Altres']
    return Array.from(set).sort((a, b) => order.indexOf(a) - order.indexOf(b))
  }, [events])

  return {
    events,
    loading,
    error,
    groupedEvents,
    totalPerDay,
    responsables,
    responsablesDetailed,
    lnOptions,
  }
}

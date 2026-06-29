'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { RoleGuard } from '@/lib/withRoleGuard'
import { Card } from '@/components/ui/card'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { colorByLN } from '@/lib/colors'
import { useFilters } from '@/context/FiltersContext'
import FilterButton from '@/components/ui/filter-button'
import { Button } from '@/components/ui/button'

type EventRow = {
  eventId: string
  eventSummary: string
  eventCode: string
  eventLocation: string
  eventDay: string
  eventLn: string
  audits: number
  lastAt: number
}

const normalizeText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const matchSmartName = (name: string, rawQuery: string) => {
  const q = normalizeText(rawQuery)
  if (!q) return true

  const n = normalizeText(name)
  if (n.includes(q)) return true

  const qTokens = q.split(/\s+/).filter(Boolean)
  if (!qTokens.length) return true
  if (qTokens.every((token) => n.includes(token))) return true

  const nTokens = n.split(/\s+/).filter(Boolean)
  if (qTokens.every((token) => nTokens.some((nToken) => nToken.startsWith(token)))) return true

  return false
}

const toStartTs = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const toEndTs = (iso: string) => {
  const d = new Date(`${iso}T23:59:59`)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

const formatIsoDay = (iso?: string) => {
  const raw = String(iso || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '-'
  const [yyyy, mm, dd] = raw.split('-')
  return `${dd}/${mm}/${yyyy}`
}

const lnFromCode = (code?: string) => {
  const s = String(code || '').trim().toUpperCase()
  if (!s) return ''
  if (s.startsWith('E-')) return 'Empresa'
  if (s.startsWith('C-')) return 'Casaments'
  if (s.startsWith('F-')) return 'Foodlovers'
  if (s.startsWith('PM')) return 'Agenda'
  return ''
}

export default function AuditoriaConsultaPage() {
  const { setContent, setOpen } = useFilters()
  const now = new Date()
  const [fromDate, setFromDate] = useState(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'))
  const [query, setQuery] = useState('')
  const [lnFilter, setLnFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [events, setEvents] = useState<EventRow[]>([])

  const load = useCallback(async (opts?: { fromTs?: number; toTs?: number }) => {
    setLoading(true)
    setError('')
    try {
      const fromTs = typeof opts?.fromTs === 'number' ? opts.fromTs : toStartTs(fromDate)
      const toTs = typeof opts?.toTs === 'number' ? opts.toTs : toEndTs(toDate)

      const qs = new URLSearchParams({ limit: '300' })
      if (fromTs > 0) qs.set('fromTs', String(fromTs))
      if (toTs > 0) qs.set('toTs', String(toTs))

      const res = await fetch(`/api/auditoria/consulta/summary?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json?.error || 'No s ha pogut carregar la consulta'))
      setEvents(Array.isArray(json?.events) ? (json.events as EventRow[]) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error carregant consulta')
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    void load()
  }, [load])

  const lnOptions = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.eventLn || lnFromCode(e.eventCode)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [events])

  const locationOptions = useMemo(() => {
    return Array.from(new Set(events.map((e) => e.eventLocation).filter((v) => v && v !== '-'))).sort((a, b) => a.localeCompare(b))
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (!matchSmartName(event.eventSummary, query)) return false
      if (lnFilter) {
        const lnValue = event.eventLn || lnFromCode(event.eventCode)
        if (normalizeText(lnValue) !== normalizeText(lnFilter)) return false
      }
      if (locationFilter) {
        if (normalizeText(event.eventLocation) !== normalizeText(locationFilter)) return false
      }
      return true
    })
  }, [events, query, lnFilter, locationFilter])

  const groupedByDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    filteredEvents.forEach((event) => {
      const key = /^\d{4}-\d{2}-\d{2}$/.test(event.eventDay) ? event.eventDay : 'sense-dia'
      const list = map.get(key) || []
      list.push(event)
      map.set(key, list)
    })
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'sense-dia' && b !== 'sense-dia') return 1
      if (b === 'sense-dia' && a !== 'sense-dia') return -1
      return a.localeCompare(b)
    })
  }, [filteredEvents])

  const onDatesChange = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    setFromDate(f.start)
    setToDate(f.end)
    load({ fromTs: toStartTs(f.start), toTs: toEndTs(f.end) })
  }

  const openAdvancedFilters = useCallback(() => {
    setContent(
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">LN</label>
          <select
            value={lnFilter || '__all__'}
            onChange={(e) => setLnFilter(e.target.value === '__all__' ? '' : e.target.value)}
            className="h-10 rounded-xl border bg-white px-3 text-sm"
          >
            <option value="__all__">Totes</option>
            {lnOptions.map((ln) => (
              <option key={ln} value={ln}>
                {ln}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">Ubicacio</label>
          <select
            value={locationFilter || '__all__'}
            onChange={(e) => setLocationFilter(e.target.value === '__all__' ? '' : e.target.value)}
            className="h-10 rounded-xl border bg-white px-3 text-sm"
          >
            <option value="__all__">Totes</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </div>
    )
  }, [lnFilter, lnOptions, locationFilter, locationOptions, setContent, setOpen])

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-none p-3 sm:p-4 space-y-4">
        <div className="w-full bg-gradient-to-r from-cyan-100 to-teal-100 border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-800">
            <Link href="/menu/auditoria" className="hover:underline">Auditoria</Link>
            <span className="mx-1 text-gray-500">/</span>
            <Link href="/menu/auditoria/consulta" className="hover:underline">Consulta</Link>
          </div>
          <div className="text-xs italic text-gray-600">Llistat d'auditories validades</div>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
            <SmartFilters
              modeDefault="week"
              role="Admin"
              showDepartment={false}
              showWorker={false}
              showLocation={false}
              showStatus={false}
              showCommercial={false}
              showImportance={false}
              compact
              showAdvanced={false}
              initialStart={fromDate}
              initialEnd={toDate}
              onChange={onDatesChange}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar esdeveniment"
              className="h-10 min-w-[220px] flex-1 rounded-xl border border-gray-300 bg-white px-3 text-sm"
            />
            <FilterButton onClick={openAdvancedFilters} />
          </div>

          {loading ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">Carregant...</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : groupedByDay.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600">No hi ha esdeveniments en aquest periode.</div>
          ) : (
            <div className="space-y-3">
              {groupedByDay.map(([day, dayEvents]) => (
                <section key={day} className="space-y-2">
                  <header className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 shadow-sm">
                    <h2 className="text-sm font-semibold text-gray-800">
                      {day === 'sense-dia' ? 'Sense dia' : formatIsoDay(day)}
                    </h2>
                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-[3px] text-xs font-semibold text-indigo-700">
                      {dayEvents.length} esdeveniments
                    </span>
                  </header>
                  {dayEvents.map((event) => {
                    const lnLabel = event.eventLn || lnFromCode(event.eventCode)
                    const lnClass = colorByLN(lnLabel)
                    return (
                      <Link
                        key={event.eventId}
                        href={`/menu/auditoria/consulta/${encodeURIComponent(event.eventId)}?fromTs=${toStartTs(fromDate)}&toTs=${toEndTs(toDate)}&eventDay=${encodeURIComponent(event.eventDay || '')}`}
                        className="block rounded-xl border bg-white p-3 hover:bg-cyan-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="truncate text-sm font-semibold text-gray-900">{event.eventSummary}</div>
                          {lnLabel ? (
                            <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10px] font-semibold ${lnClass}`}>
                              {lnLabel}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          Codi: {event.eventCode || ''} - Ubicacio: {event.eventLocation || '-'}
                        </div>
                      </Link>
                    )
                  })}
                </section>
              ))}
            </div>
          )}
        </Card>
      </div>
    </RoleGuard>
  )
}



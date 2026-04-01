// file: src/app/menu/quadrants/page.tsx
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'
import { useSession } from 'next-auth/react'
import * as XLSX from 'xlsx'
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import ExportMenu from '@/components/export/ExportMenu'

import useFetch from '@/hooks/useFetch'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import { useQuadrants } from '@/app/menu/quadrants/hooks/useQuadrants'
import QuadrantModal from './[id]/components/QuadrantModal'
import QuadrantCard from './drafts/components/QuadrantCard'
import { useQuadrantsPageData } from './hooks/useQuadrantsPageData'
import type { UnifiedEvent } from './types'


export default function QuadrantsPage() {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  const end = endOfWeek(new Date(), { weekStartsOn: 1 })

  const [filters, setFilters] = useState<FiltersState>(() => ({
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    mode: 'week',
    ln: '__all__',
    responsable: '__all__',
    location: '__all__',
    status: '__all__',
  }))

  const {
    data: events = [],
    loading,
    error,
  } = useFetch('/api/events/quadrants', filters.start, filters.end)

  const { data: session } = useSession()
  const department =
    (
      session?.user?.department ||
      (session as any)?.department ||
      (session as any)?.dept ||
      'serveis'
    )
      .toString()
      .toLowerCase()
  const isCuinaDepartment = department === 'cuina'
  const [hideCuinaMinorServices, setHideCuinaMinorServices] = useState(
    isCuinaDepartment
  )

  useEffect(() => {
    setHideCuinaMinorServices(isCuinaDepartment)
  }, [isCuinaDepartment])

  const { quadrants, reload } = useQuadrants(
    department,
    filters.start,
    filters.end
  )
  const [surveyKeys, setSurveyKeys] = useState<string[]>([])
  useEffect(() => {
    const handler = () => reload()

    window.addEventListener('quadrant:created', handler)
    window.addEventListener('quadrant:updated', handler)

    return () => {
      window.removeEventListener('quadrant:created', handler)
      window.removeEventListener('quadrant:updated', handler)
    }
  }, [reload])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const res = await fetch(
          `/api/quadrants/surveys/summary?start=${encodeURIComponent(filters.start)}&end=${encodeURIComponent(filters.end)}`,
          { cache: 'no-store' }
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok || cancelled) return
        setSurveyKeys(Array.isArray(json?.surveyKeys) ? json.surveyKeys : [])
      } catch {
        if (!cancelled) setSurveyKeys([])
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [filters.end, filters.start])

  const surveyKeySet = useMemo(() => new Set(surveyKeys), [surveyKeys])


  const [selected, setSelected] = useState<UnifiedEvent | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)

  const {
    filteredEvents,
    phasesByEventId,
  } = useQuadrantsPageData({
    events,
    quadrants,
    filters,
  })

  const normalizeForFilter = (value?: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  const shouldHideCuinaEvent = (ev: UnifiedEvent) => {
    if (!isCuinaDepartment || !hideCuinaMinorServices) return false

    const service = normalizeForFilter((ev as any).service)
    const pax = Number(ev.numPax ?? (ev as any).pax ?? NaN)

    const isCoffee = service.includes('coffee')
    const isMenuEntregues =
      service.includes('menu') && service.includes('entregues')
    const isCheersLowPax =
      service.includes('cheers') && Number.isFinite(pax) && pax < 200

    return isCoffee || isMenuEntregues || isCheersLowPax
  }

  const visibleFilteredEvents = useMemo(
    () => filteredEvents.filter((ev) => !shouldHideCuinaEvent(ev)),
    [filteredEvents, hideCuinaMinorServices, isCuinaDepartment]
  )

  const visibleGrouped = useMemo<[string, UnifiedEvent[]][]>(() => {
    const map: Record<string, UnifiedEvent[]> = {}
    for (const ev of visibleFilteredEvents) {
      const day = ev.start.slice(0, 10)
      if (!map[day]) map[day] = []
      map[day].push(ev)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [visibleFilteredEvents])

  const visibleEventDaysByEventId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const candidate of visibleFilteredEvents) {
      const eventId = String(candidate.eventId || candidate.id || '').trim()
      if (!eventId) continue
      const day = String(candidate.phaseDate || candidate.start || '').slice(0, 10)
      if (!day) continue
      const list = map.get(eventId) || []
      list.push(day)
      map.set(eventId, list)
    }
    for (const [eventId, days] of map.entries()) {
      map.set(eventId, Array.from(new Set(days)).sort((a, b) => a.localeCompare(b)))
    }
    return map
  }, [visibleFilteredEvents])

  const buildSelectedEvent = (ev: UnifiedEvent, phaseKey?: string): UnifiedEvent => {
    const targetEventId = String(ev.eventId || ev.id || '').trim()
    const relatedDays = visibleEventDaysByEventId.get(targetEventId) || []

    return {
      ...ev,
      phaseKey: phaseKey ?? ev.phaseKey,
      startTime: ev.displayStartTime || ev.startTime,
      endTime: ev.displayEndTime || ev.endTime,
      originalStart: ev.originalStart || (relatedDays[0] ? `${relatedDays[0]}T00:00:00.000Z` : ev.start),
      originalEnd:
        ev.originalEnd ||
        (relatedDays.length > 0
          ? `${relatedDays[relatedDays.length - 1]}T00:00:00.000Z`
          : ev.end),
    }
  }

  const visibleCounts = useMemo(() => {
    let pending = 0
    let draft = 0
    let confirmed = 0
    visibleFilteredEvents.forEach((ev) => {
      if (ev.quadrantStatus === 'draft') draft += 1
      else if (ev.quadrantStatus === 'confirmed') confirmed += 1
      else pending += 1
    })
    return { pending, draft, confirmed }
  }, [visibleFilteredEvents])

  
  const lnOptions = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev: any) => {
      if (ev.ln || ev.lnLabel) {
        set.add((ev.ln || ev.lnLabel).toString().trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  const responsables = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev: any) => {
      if (ev.responsable) {
        set.add(ev.responsable.toString().trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  const locations = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev: any) => {
      if (ev.location) {
        set.add(ev.location.toString().trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  
  const LOGISTIC_PHASE_OPTIONS = [
    { key: 'entrega', label: 'Entrega' },
    { key: 'event', label: 'Event' },
    { key: 'recollida', label: 'Recollida' },
  ]

  const SERVICE_PHASE_OPTIONS = [
    { key: 'muntatge', label: 'Muntatge' },
    { key: 'event', label: 'Event' },
  ]
  const CUINA_PHASE_OPTIONS = [{ key: 'event', label: 'Event' }]

  const phaseOptions = useMemo(
    () => {
      if (department === 'cuina') {
        return CUINA_PHASE_OPTIONS
      }
      if (department === 'serveis') {
        return SERVICE_PHASE_OPTIONS
      }
      return LOGISTIC_PHASE_OPTIONS
    },
    [department]
  )

  const exportBase = `quadrants-${String(department || 'dept').replace(
    /\\s+/g,
    '-'
  )}-${filters.start}-${filters.end}`

  const statusLabel = (status?: string) => {
    if (status === 'confirmed') return 'Confirmat'
    if (status === 'draft') return 'Esborrany'
    if (status === 'pending') return 'Pendent'
    return ''
  }

  const getMultiDayRangeLabel = (ev: UnifiedEvent) => {
    const originalStart = String(ev.originalStart || ev.start || '').slice(0, 10)
    const originalEnd = String(ev.originalEnd || ev.end || '').slice(0, 10)
    if (!originalStart || !originalEnd || originalStart === originalEnd) return null

    try {
      return `${format(parseISO(originalStart), 'dd/MM')}-${format(parseISO(originalEnd), 'dd/MM')}`
    } catch {
      return null
    }
  }

  const exportRows = useMemo(
    () =>
      visibleFilteredEvents.map((ev) => {
        const startDate = String(ev.start || '').slice(0, 10)
        const startTime = ev.displayStartTime || ''
        const endTime = ev.displayEndTime || ''
        const timeRange =
          startTime || endTime ? `${startTime} - ${endTime}`.trim() : ''
        const horariLabel = ev.horariLabel || timeRange

        const rowDate = ev.start ? ev.start.slice(0, 10) : ''
        const eventDateRaw = ev.eventDateRaw || ''
        const hasPhaseLabel = Boolean(ev.phaseLabel)
        const showEventDate =
          hasPhaseLabel &&
          eventDateRaw &&
          rowDate &&
          eventDateRaw !== rowDate
        const phaseLabel = ev.phaseLabel ? ev.phaseLabel.toUpperCase() : ''
        const phaseLabelWithDate =
          hasPhaseLabel && showEventDate && ev.eventDateLabel
            ? `${phaseLabel} (${ev.eventDateLabel})`
            : phaseLabel

        return {
          Data: startDate,
          Responsable: ev.responsable || '',
          Fase: phaseLabelWithDate,
          Esdeveniment: ev.summary || '',
          LN: ev.ln || '',
          PAX: ev.numPax ?? '',
          Ubicacio: ev.location || '',
          Servei: (ev as any).service || '',
          Treballadors: ev.workersSummary || '',
          Horari: horariLabel,
          Estat: statusLabel(ev.quadrantStatus),
        }
      }),
    [visibleFilteredEvents]
  )

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Quadrants')
    XLSX.writeFile(wb, `${exportBase}.xlsx`)
  }

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const buildPdfTableHtml = () => {
    const cols = [
      'Data',
      'Responsable',
      'Fase',
      'Esdeveniment',
      'LN',
      'PAX',
      'Ubicacio',
      'Servei',
      'Treballadors',
      'Horari',
      'Estat',
    ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String((row as any)[key] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>${escapeHtml(exportBase)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
      th { background: #f3f4f6; text-align: left; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Quadrants</h1>
    <div class=\"meta\">Rang: ${escapeHtml(filters.start)} - ${escapeHtml(
      filters.end
    )}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    const html = buildPdfTableHtml()
    const win = window.open('', '_blank', 'width=1200,height=900')
    if (!win) return
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const handleExportPdfView = () => {
    window.print()
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel },
    { label: 'PDF (vista)', onClick: handleExportPdfView },
    { label: 'PDF (taula)', onClick: handleExportPdfTable },
  ]

  
  return (
    <main className="space-y-6 px-4 pb-12">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #quadrants-print-root, #quadrants-print-root * { visibility: visible; }
          #quadrants-print-root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <ModuleHeader
        icon={<CalendarDays className="w-7 h-7 text-indigo-600" />}
        title="Quadrants"
        subtitle="Gestió setmanal per departament"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/menu/quadrants/premisses"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Premisses
            </Link>
            <ExportMenu items={exportItems} />
          </div>
        }
      />
      <FiltersBar
        id="filters-bar"
        filters={filters}
        setFilters={(patch) =>
          setFilters((prev) => ({ ...prev, ...patch }))
        }
        lnOptions={lnOptions}
        responsables={responsables}
        locations={locations}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-50 border rounded-2xl p-3 shadow-sm text-sm font-medium">
        <div className="flex gap-6 sm:gap-10">
          <span className="flex items-center gap-2 text-yellow-700">
            <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
            Pendents: {visibleCounts.pending}
          </span>
          <span className="flex items-center gap-2 text-blue-700">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
            Esborranys: {visibleCounts.draft}
          </span>
          <span className="flex items-center gap-2 text-green-700">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full" />
            Confirmats: {visibleCounts.confirmed}
          </span>
        </div>
        {isCuinaDepartment && (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={hideCuinaMinorServices}
              onChange={(e) => setHideCuinaMinorServices(e.target.checked)}
            />
            Amaga Coffee, Menu entregues i Cheers &lt; 200 PAX
          </label>
        )}
      </div>

      {loading && (
        <p className="text-center text-gray-500 py-10">
          Carregant quadrants¦
        </p>
      )}

      {Boolean(error) && (
        <p className="text-center text-red-600 py-10">
          {String(error)}
        </p>
      )}

      {!loading && !error && visibleGrouped.length === 0 && (
        <p className="text-center text-gray-400 py-10">
          Cap esdeveniment trobat per aquest rang de dates.
        </p>
      )}

      {!loading && !error && visibleGrouped.length > 0 && (
        <div
          id="quadrants-print-root"
          className="overflow-x-auto rounded-xl border bg-white shadow-sm"
        >
          <table className="w-full text-sm">
            <tbody>
              {visibleGrouped.map(([day, evs]) => (
                <React.Fragment key={day}>
                  <tr className="bg-transparent">
                    <td colSpan={11} className="px-2 py-2">
                      <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
                        <div className="text-xl font-semibold leading-none tracking-tight text-slate-700">
                          {format(parseISO(day), 'dd/MM/yyyy')}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-full bg-violet-100/80 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                            {evs.length} {evs.length === 1 ? 'esdeveniment' : 'esdeveniments'}
                          </div>
                          <div className="rounded-full bg-fuchsia-100/80 px-2.5 py-1 text-[11px] font-medium text-fuchsia-700">
                            {evs.reduce((sum, item) => sum + Number(item.numPax || 0), 0)} pax
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>

                  {/* Files per esdeveniment */}
                  {evs.map((ev, evIdx) => {
                    const draft = (ev as any).draft

                    const dotClass =
                      ev.quadrantStatus === 'confirmed'
                        ? 'bg-green-500'
                        : ev.quadrantStatus === 'draft'
                        ? 'bg-blue-500'
                        : 'bg-yellow-400'

                    const startTime = ev.displayStartTime || '--:--'
                    const endTime = ev.displayEndTime || '--:--'
                    const horariLabel = ev.horariLabel || `${startTime} - ${endTime}`
                    const rowDate = ev.start ? ev.start.slice(0, 10) : ''
                    const eventDateRaw = ev.eventDateRaw || ''
                    const hasPhaseLabel = Boolean(ev.phaseLabel)
                    const showEventDate =
                      hasPhaseLabel &&
                      eventDateRaw &&
                      rowDate &&
                      eventDateRaw !== rowDate
                    const phaseLabel = ev.phaseLabel ? ev.phaseLabel.toUpperCase() : ''
                    const phaseLabelWithDate =
                      hasPhaseLabel && showEventDate && ev.eventDateLabel
                        ? `${phaseLabel} (${ev.eventDateLabel})`
                        : phaseLabel
                    const multiDayRangeLabel = getMultiDayRangeLabel(ev)
                    const eventId = String(ev.eventId || ev.eventCode || ev.code || ev.id || "")
                      .trim()
                    const surveyKey = `${eventId.split('__')[0]}__${String(
                      ev.phaseDate || ev.start || ''
                    ).slice(0, 10)}`
                    const hasSurvey = surveyKeySet.has(surveyKey)
                    const existingPhases = eventId ? phasesByEventId[eventId] : undefined
                    const pendingPhases = eventId
                      ? phaseOptions
                          .filter((p) => !(existingPhases && existingPhases.has(p.key)))
                          .map((p) => ({
                            key: p.key,
                            label:
                              p.key !== 'event' && ev.eventDateLabel
                                ? `${p.label} (${ev.eventDateLabel})`
                                : p.label,
                          }))
                      : []

                    const fragmentKey = `${eventId || ev.id || ''}__${
                      ev.phaseKey || ev.phaseType || ev.phaseLabel || 'event'
                    }__${ev.phaseDate || ev.start || ''}__${ev.id || 'row'}__${evIdx}`
                    const isExpanded = Boolean(draft && draft.id && expandedId === draft.id)
                    return (
                      <React.Fragment key={fragmentKey}>
                        <tr
                          className={`cursor-pointer transition ${
                            evIdx < evs.length - 1 ? 'border-b border-slate-200' : ''
                          } ${
                            isExpanded
                              ? 'bg-teal-100/55 hover:bg-teal-100/65'
                              : 'bg-teal-50/35 hover:bg-teal-50/55'
                          }`}
                          onClick={() => {
                            if (ev.quadrantStatus === 'pending') {
                              setSelected(buildSelectedEvent(ev))
                            } else if (draft && draft.id) {
                              setExpandedId((prev) =>
                                prev === draft.id ? null : draft.id
                              )
                            }
                          }}
                        >
                          <td className="px-3 py-2.5 text-[14px] font-semibold text-slate-900">
                            {ev.responsable || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {hasPhaseLabel ? (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                {phaseLabelWithDate}
                              </span>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-[16px] font-semibold tracking-tight text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{ev.summary}</span>
                              {hasSurvey && (
                                <span
                                  className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                                  title="Sondeig enviat"
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Sondeig
                                </span>
                              )}
                              {multiDayRangeLabel && (
                                <span
                                  className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                                  title={`Esdeveniment multi-dia: ${multiDayRangeLabel}`}
                                >
                                  <CalendarDays className="mr-1 h-3 w-3" />
                                  {multiDayRangeLabel}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[14px] text-slate-700">{ev.ln || '-'}</td>
                          <td className="px-3 py-2.5 text-[14px] font-semibold text-slate-800">{ev.numPax ?? '-'}</td>
                          <td className="px-3 py-2.5 text-[14px] text-slate-700">
                            {ev.location || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-[14px] text-slate-800">
                            {ev.service || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-[14px] font-semibold text-slate-900">
                            {startTime}
                          </td>
                          <td className="px-3 py-2.5 text-[14px] text-slate-800">
                            {ev.workersSummary || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-[14px] font-semibold text-slate-900">
                            {horariLabel}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="inline-flex items-center gap-2">
                              {draft && draft.id && (
                                <span className="text-slate-600">
                                  {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                </span>
                              )}
                              <span
                                className={`inline-block w-3 h-3 rounded-full ${dotClass}`}
                              />
                            </div>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={11} className="bg-slate-50/40 px-3 pt-1 pb-2">
                              <div className="p-0">
                               <QuadrantCard
                                 quadrant={draft}
                                 autoExpand
                                 pendingPhases={pendingPhases}
                                 onCreatePhase={(phaseKey) => {
                                   setSelected(buildSelectedEvent(ev, phaseKey))
                                 }}
                               />

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <QuadrantModal
          open
          event={selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        />
      )}
    </main>
  )
}

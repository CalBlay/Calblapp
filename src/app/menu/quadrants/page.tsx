// file: src/app/menu/quadrants/page.tsx
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'
import { useSession } from 'next-auth/react'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import ExportMenu from '@/components/export/ExportMenu'

import type { QuadrantEvent } from '@/types/QuadrantEvent'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import QuadrantModal from './[id]/components/QuadrantModal'
import QuadrantCard from './drafts/components/QuadrantCard'
import { useQuadrantsPageData } from './hooks/useQuadrantsPageData'
import type { UnifiedEvent } from './types'
import type { Draft } from './drafts/page'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { PERM } from '@/lib/permissionKeys'
import { QUADRANTS_ACTION, QUADRANTS_UI_PATH } from '@/lib/quadrantsPermissions'

type SessionDepartmentSource = {
  department?: string
  dept?: string
}

type QuadrantEventLike = QuadrantEvent & {
  ln?: string | null
  lnLabel?: string | null
}

type QuadrantDraftDetails = {
  id?: string
  vestimentModel?: string | null
  attentionNotes?: string[]
  violations?: string[]
}

type ExportRow = {
  Data: string
  Responsable: string
  Fase: string
  Esdeveniment: string
  LN: string
  PAX: number | ''
  Ubicacio: string
  Servei: string
  Vestimenta: string
  Treballadors: string
  Horari: string
  Estat: string
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function normPhaseKey(value: unknown) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

/** Data d’inici de l’esdeveniment (stage / calendari) per mostrar entre parèntesi. */
function eventStartDisplayLabel(ev: UnifiedEvent): string {
  if (ev.eventDateLabel && String(ev.eventDateLabel).trim()) return String(ev.eventDateLabel).trim()
  const ymd = String(ev.eventDateRaw || ev.originalStart || '').slice(0, 10)
  if (!ISO_DAY.test(ymd)) return ''
  try {
    return format(parseISO(ymd), 'dd/MM')
  } catch {
    return ''
  }
}

function isEventPhaseRow(ev: UnifiedEvent) {
  const k = normPhaseKey(ev.phaseKey)
  const t = normPhaseKey(ev.phaseType)
  const lbl = normPhaseKey(ev.phaseLabel)
  return k === 'event' || t === 'event' || lbl === 'event'
}

/**
 * Pastilla de fase: si no és «event», sempre `FASE (data inici esdeveniment)` quan hi ha data;
 * si és «event» i l’acte és multi-dia: `EVENT (dd/MM - dd/MM)`; si és un sol dia, parèntesi només
 * quan la fila és un altre dia que l’inici de l’esdeveniment.
 */
function buildQuadrantPhaseBadge(ev: UnifiedEvent, rowDate: string): string {
  const row = rowDate.slice(0, 10)
  const eventDateRaw = String(ev.eventDateRaw || '').slice(0, 10)
  const phaseUpper = ev.phaseLabel ? ev.phaseLabel.toUpperCase() : ''

  if (!isEventPhaseRow(ev) && phaseUpper) {
    const startLbl = eventStartDisplayLabel(ev)
    return startLbl ? `${phaseUpper} (${startLbl})` : phaseUpper
  }

  const hasPhaseLabel = Boolean(ev.phaseLabel)
  if (!hasPhaseLabel) return ''

  // Només dates de l’esdeveniment (stage_verd / calendari): DataInici + DataFi.
  // No usar ev.end (sovit horari o dia del quadrant).
  const origStart = String(ev.originalStart || ev.eventDateRaw || '').slice(0, 10)
  const origEnd = String(ev.originalEnd || '').slice(0, 10)
  const isMultiDay =
    ISO_DAY.test(origStart) &&
    ISO_DAY.test(origEnd) &&
    origStart !== origEnd

  if (isMultiDay) {
    try {
      const span = `${format(parseISO(origStart), 'dd/MM')} - ${format(parseISO(origEnd), 'dd/MM')}`
      return `${phaseUpper} (${span})`
    } catch {
      /* continua amb la lògica d’un sol dia */
    }
  }

  const showEventDate =
    hasPhaseLabel && eventDateRaw && row && eventDateRaw !== row
  if (showEventDate && ev.eventDateLabel) {
    return `${phaseUpper} (${ev.eventDateLabel})`
  }
  return phaseUpper
}

const LOGISTIC_PHASE_OPTIONS = [
  { key: 'event', label: 'Event' },
  { key: 'entrega', label: 'Entrega' },
  { key: 'recollida', label: 'Recollida' },
]

const SERVICE_PHASE_OPTIONS = [
  { key: 'event', label: 'Event' },
  { key: 'muntatge', label: 'Muntatge' },
]

const CUINA_PHASE_OPTIONS = [{ key: 'event', label: 'Event' }]

type DashboardResponse = {
  events?: QuadrantEvent[]
  quadrants?: Draft[]
  surveyKeys?: string[]
}

type QuadrantsPageDataInput = Parameters<typeof useQuadrantsPageData>[0]

const fetchDashboard = async (url: string): Promise<DashboardResponse> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}


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

  const { data: session } = useSession()
  const { ready: permsReady, hasAction } = useUiPermissions()
  const canPremisses =
    !permsReady ||
    hasAction(PERM.action(QUADRANTS_UI_PATH, QUADRANTS_ACTION.PREMISSES_EDIT))
  const sessionUser = session?.user as SessionDepartmentSource | undefined
  const department =
    (
      sessionUser?.department ||
      sessionUser?.dept ||
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

  const dashboardUrl = useMemo(() => {
    const params = new URLSearchParams({
      department,
      start: filters.start,
      end: filters.end,
    })
    return `/api/quadrants/dashboard?${params.toString()}`
  }, [department, filters.end, filters.start])

  const {
    data: dashboardData,
    error,
    isLoading: loading,
    mutate: reload,
  } = useSWR<DashboardResponse>(dashboardUrl, fetchDashboard)

  const events = useMemo(
    () => (Array.isArray(dashboardData?.events) ? dashboardData.events : []),
    [dashboardData?.events]
  ) as QuadrantEvent[]
  const quadrants = useMemo<QuadrantsPageDataInput['quadrants']>(
    () =>
      (Array.isArray(dashboardData?.quadrants) ? dashboardData.quadrants : []).map(
        (item) => ({
          ...item,
          phaseType: item.phaseType ?? undefined,
          phaseLabel: item.phaseLabel ?? undefined,
        })
      ) as unknown as QuadrantsPageDataInput['quadrants'],
    [dashboardData?.quadrants]
  )
  const surveyKeys = useMemo(
    () => (Array.isArray(dashboardData?.surveyKeys) ? dashboardData.surveyKeys : []),
    [dashboardData?.surveyKeys]
  )

  useEffect(() => {
    const handler = () => {
      void reload()
    }

    window.addEventListener('quadrant:created', handler)
    window.addEventListener('quadrant:updated', handler)

    return () => {
      window.removeEventListener('quadrant:created', handler)
      window.removeEventListener('quadrant:updated', handler)
    }
  }, [reload])

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

  const shouldHideCuinaEvent = useCallback((ev: UnifiedEvent) => {
    if (!isCuinaDepartment || !hideCuinaMinorServices) return false

    const service = normalizeForFilter(ev.service)
    const pax = Number(ev.numPax ?? NaN)

    const isCoffee = service.includes('coffee')
    const isMenuEntregues =
      service.includes('menu') && service.includes('entregues')
    const isCheersLowPax =
      service.includes('cheers') && Number.isFinite(pax) && pax < 200

    return isCoffee || isMenuEntregues || isCheersLowPax
  }, [hideCuinaMinorServices, isCuinaDepartment])

  const visibleFilteredEvents = useMemo(
    () => filteredEvents.filter((ev) => !shouldHideCuinaEvent(ev)),
    [filteredEvents, shouldHideCuinaEvent]
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
    events.forEach((ev) => {
      const event = ev as QuadrantEventLike
      const lnValue = event.ln ?? event.lnLabel
      if (lnValue) {
        set.add(String(lnValue).trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  const responsables = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev) => {
      if (ev.responsable) {
        set.add(ev.responsable.toString().trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  const locations = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev) => {
      if (ev.location) {
        set.add(ev.location.toString().trim().toLowerCase())
      }
    })
    return Array.from(set).sort()
  }, [events])

  
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

  const exportRows = useMemo(
    () =>
      visibleFilteredEvents.map((ev): ExportRow => {
        const startDate = String(ev.start || '').slice(0, 10)
        const startTime = ev.displayStartTime || ''
        const endTime = ev.displayEndTime || ''
        const timeRange =
          startTime || endTime ? `${startTime} - ${endTime}`.trim() : ''
        const horariLabel = ev.horariLabel || timeRange

        const rowDate = ev.start ? ev.start.slice(0, 10) : ''
        const phaseLabelWithDate = buildQuadrantPhaseBadge(ev, rowDate)

        return {
          Data: startDate,
          Responsable: ev.responsable || '',
          Fase: phaseLabelWithDate,
          Esdeveniment: ev.summary || '',
          LN: ev.ln || '',
          PAX: ev.numPax ?? '',
          Ubicacio: ev.location || '',
          Servei: ev.service || '',
          Vestimenta:
            String(ev.vestimentModel || '').trim() ||
            String((ev.draft as QuadrantDraftDetails | undefined)?.vestimentModel || '').trim(),
          Treballadors: ev.workersSummary || '',
          Horari: horariLabel,
          Estat: statusLabel(ev.quadrantStatus),
        }
      }),
    [visibleFilteredEvents]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
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
      'Vestimenta',
      'Treballadors',
      'Horari',
      'Estat',
    ]

    const header = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String(row[key as keyof ExportRow] ?? ''))}</td>`)
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
    printBrandedHtmlInNewWindow(html)
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
            {canPremisses ? (
              <Link
                href="/menu/quadrants/premisses"
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Premisses
              </Link>
            ) : null}
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
                    <td colSpan={12} className="px-2 py-2">
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
                    const draft = ev.draft as (Draft & QuadrantDraftDetails) | undefined

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
                    const phaseLabelWithDate = buildQuadrantPhaseBadge(ev, rowDate)
                    const hasPhaseBadge = Boolean(phaseLabelWithDate)
                    const eventId = String(ev.eventId || ev.eventCode || ev.code || ev.id || "")
                      .trim()
                    const surveyKey = `${eventId.split('__')[0]}__${String(
                      ev.phaseDate || ev.start || ''
                    ).slice(0, 10)}`
                    const hasSurvey = surveyKeySet.has(surveyKey)
                    const existingPhases = eventId ? phasesByEventId[eventId] : undefined
                    const pendingPhaseStartLbl = eventStartDisplayLabel(ev)
                    const pendingPhases = eventId
                      ? phaseOptions
                          .filter((p) => !(existingPhases && existingPhases.has(p.key)))
                          .map((p) => ({
                            key: p.key,
                            label:
                              p.key !== 'event' && pendingPhaseStartLbl
                                ? `${p.label} (${pendingPhaseStartLbl})`
                                : p.label,
                          }))
                      : []

                    const fragmentKey = `${eventId || ev.id || ''}__${
                      ev.phaseKey || ev.phaseType || ev.phaseLabel || 'event'
                    }__${ev.phaseDate || ev.start || ''}__${ev.id || 'row'}__${evIdx}`
                    const isExpanded = Boolean(draft && draft.id && expandedId === draft.id)
                    const draftAttention = draft && Array.isArray(draft.attentionNotes)
                      ? draft.attentionNotes
                      : []
                    const draftViolations =
                      draft && Array.isArray(draft.violations)
                        ? draft.violations
                        : []
                    const hasOverlapWarning =
                      draftAttention.some((n) => n.includes('ja està assignat')) ||
                      draftViolations.includes('person_double_booked')
                    const vestimentModel =
                      String(ev.vestimentModel || '').trim() ||
                      String(draft?.vestimentModel || '').trim() ||
                      '-'
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
                              const nextExpandedId = draft.id
                              setExpandedId((prev) =>
                                prev === nextExpandedId ? null : nextExpandedId
                              )
                            }
                          }}
                        >
                          <td className="px-3 py-2.5 text-[14px] font-semibold text-slate-900">
                            {ev.responsable || '-'}
                          </td>
                          <td className="px-3 py-2">
                            {hasPhaseBadge ? (
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
                          <td className="px-3 py-2.5 text-[14px] text-slate-800">
                            {vestimentModel}
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
                              {hasOverlapWarning && (
                                <span
                                  className="text-amber-600"
                                  title={draftAttention[0] || 'Possible solapament de personal'}
                                >
                                  <AlertTriangle className="h-4 w-4" aria-hidden />
                                </span>
                              )}
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
                            <td colSpan={12} className="bg-slate-50/40 px-3 pt-1 pb-2">
                              <div className="p-0">
                               {draft ? (
                                 <QuadrantCard
                                   quadrant={draft}
                                   autoExpand
                                   pendingPhases={pendingPhases}
                                   onCreatePhase={(phaseKey) => {
                                     setSelected(buildSelectedEvent(ev, phaseKey))
                                   }}
                                 />
                               ) : null}

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
          onSaved={async () => {
            await reload()
          }}
          onOpenChange={(open) => {
            if (!open) setSelected(null)
          }}
        />
      )}
    </main>
  )
}

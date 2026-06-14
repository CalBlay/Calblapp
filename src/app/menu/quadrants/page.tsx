// file: src/app/menu/quadrants/page.tsx
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { useSession } from 'next-auth/react'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'
import { CalendarDays } from 'lucide-react'
import ExportMenu from '@/components/export/ExportMenu'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { CorporateFiltersShell, CorporateFilterField, CorporateFilterSelect } from '@/components/layout/corporate-filters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import { buildQuadrantPhaseBadge, quadrantStatusLabel } from '@/lib/quadrantsDisplayUtils'
import { groupQuadrantsByDayAndEvent } from '@/lib/quadrantsGrouping'
import {
  findPhaseByPendingExpandKey,
  isPendingExpandKey,
} from '@/lib/buildPendingQuadrantDraft'
import { useQuadrantMutationListeners } from '@/app/menu/quadrants/hooks/useQuadrantMutationListeners'

import type { QuadrantEvent } from '@/types/QuadrantEvent'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { type FiltersState } from '@/components/layout/FiltersBar'
import QuadrantsLnFilterBadges from './components/QuadrantsLnFilterBadges'
import QuadrantsTable from './components/QuadrantsTable'
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

type QuadrantDraftDetails = {
  id?: string
  vestimentModel?: string | null
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
    ln: 'all',
    responsable: '__all__',
    location: '__all__',
    status: '__all__',
  }))
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const { setContent, setOpen } = useFilters()

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

  useQuadrantMutationListeners(reload)

  const surveyKeySet = useMemo(() => new Set(surveyKeys), [surveyKeys])


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

  useEffect(() => {
    if (!expandedId || !isPendingExpandKey(expandedId)) return
    const phase = findPhaseByPendingExpandKey(expandedId, visibleFilteredEvents)
    const draftId = (phase?.draft as { id?: string } | undefined)?.id
    if (draftId) setExpandedId(draftId)
  }, [visibleFilteredEvents, expandedId])

  const groupedDays = useMemo(
    () => groupQuadrantsByDayAndEvent(visibleFilteredEvents),
    [visibleFilteredEvents]
  )

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

  const statusLabel = quadrantStatusLabel

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

  const handleDatesChange = (f: SmartFiltersChange) => {
    if (f.start) {
      const base = new Date(f.start)
      const weekStart = startOfWeek(base, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(base, { weekStartsOn: 1 })
      setFilters((prev) => ({
        ...prev,
        start: format(weekStart, 'yyyy-MM-dd'),
        end: format(weekEnd, 'yyyy-MM-dd'),
        mode: 'week',
      }))
    }
  }

  const resetFilters = () => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    setDateResetSignal((n) => n + 1)
    setFilters({
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      mode: 'week',
      ln: 'all',
      responsable: '__all__',
      location: '__all__',
      status: '__all__',
    })
  }

  const toggleStatusFilter = (status: 'pending' | 'draft' | 'confirmed') => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status === status ? '__all__' : status,
    }))
  }

  const openFiltersPanel = () => {
    setContent(
      <div key={`quadrants-filters-${dateResetSignal}`} className="flex flex-col gap-4 p-4">
        <CorporateFilterField label="Responsable">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={filters.responsable ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, responsable: e.target.value }))}
          >
            <option value="__all__">Tots</option>
            {responsables.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>

        <CorporateFilterField label="Ubicació">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={filters.location ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
          >
            <option value="__all__">Totes</option>
            {locations.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </CorporateFilterSelect>
        </CorporateFilterField>

        <CorporateFilterField label="Estat">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={filters.status ?? '__all__'}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="__all__">Tots</option>
            <option value="pending">Pendents</option>
            <option value="draft">Esborranys</option>
            <option value="confirmed">Confirmats</option>
          </CorporateFilterSelect>
        </CorporateFilterField>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <ResetFilterButton onClick={() => { resetFilters(); setOpen(false) }} />
        </div>
      </div>
    )
    setOpen(true)
  }

  const totalVisible = visibleFilteredEvents.length
  const statusFilterActive = filters.status !== '__all__'

  return (
    <main className="flex w-full max-w-none flex-col gap-4 p-4 pb-12">
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
        subtitle="Tauler de treball setmanal"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/menu/quadrants/operativa"
              className={cn(typography('bodyMd'), 'whitespace-nowrap font-medium hover:underline')}
            >
              Vista operativa
            </Link>
            {canPremisses ? (
              <Link
                href="/menu/quadrants/premisses"
                className={cn(typography('bodyMd'), 'whitespace-nowrap font-medium hover:underline')}
              >
                Premisses
              </Link>
            ) : null}
            <ExportMenu items={exportItems} />
          </div>
        }
      />

      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-1', typography('bodyMd'))}>
        <span>Total assignacions: {totalVisible}</span>
      </div>

      <CorporateFiltersShell variant="toolbar" className="mb-2">
        <SmartFilters
          modeDefault="week"
          role="Treballador"
          showDepartment={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          onChange={handleDatesChange}
          resetSignal={dateResetSignal}
          initialStart={filters.start}
          initialEnd={filters.end}
          compact
        />
        <QuadrantsLnFilterBadges
          value={filters.ln || 'all'}
          onChange={(ln) => setFilters((prev) => ({ ...prev, ln }))}
        />
        <div className="min-w-[8px] flex-1" />
        <FilterButton onClick={openFiltersPanel} />
      </CorporateFiltersShell>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => toggleStatusFilter('pending')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              filters.status === 'pending'
                ? 'border-yellow-300 bg-yellow-50 text-yellow-800 ring-2 ring-yellow-300/60'
                : 'border-transparent bg-yellow-50/60 text-yellow-700 hover:bg-yellow-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            Pendents: {visibleCounts.pending}
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('draft')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              filters.status === 'draft'
                ? 'border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-300/60'
                : 'border-transparent bg-blue-50/60 text-blue-700 hover:bg-blue-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            Esborranys: {visibleCounts.draft}
          </button>
          <button
            type="button"
            onClick={() => toggleStatusFilter('confirmed')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              filters.status === 'confirmed'
                ? 'border-green-300 bg-green-50 text-green-800 ring-2 ring-green-300/60'
                : 'border-transparent bg-green-50/60 text-green-700 hover:bg-green-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Confirmats: {visibleCounts.confirmed}
          </button>
          {statusFilterActive ? (
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, status: '__all__' }))}
              className={cn(
                typography('bodySm'),
                'rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50'
              )}
            >
              Mostrar tots
            </button>
          ) : null}
        </div>
        {isCuinaDepartment && (
          <label className={cn('flex items-center gap-2', typography('bodyXs'), 'text-slate-700')}>
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
        <p className={cn('py-10 text-center', typography('bodySm'), 'text-gray-500')}>
          Carregant quadrants…
        </p>
      )}

      {Boolean(error) && (
        <p className={cn('py-10 text-center text-red-600', typography('bodySm'))}>
          {String(error)}
        </p>
      )}

      {!loading && !error && groupedDays.length === 0 && (
        <p className={cn('py-10 text-center text-gray-400', typography('bodySm'))}>
          Cap esdeveniment trobat per aquest rang de dates.
        </p>
      )}

      {!loading && !error && groupedDays.length > 0 && (
        <QuadrantsTable
          groupedDays={groupedDays}
          surveyKeySet={surveyKeySet}
          phasesByEventId={phasesByEventId}
          phaseOptions={phaseOptions}
          expandedId={expandedId}
          onExpandedIdChange={setExpandedId}
          department={department}
          onRefreshDrafts={reload}
        />
      )}
    </main>
  )
}

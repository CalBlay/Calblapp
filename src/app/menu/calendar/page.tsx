'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import ExportMenu from '@/components/export/ExportMenu'
import { useCalendarData } from '@/hooks/useCalendarData'
import CalendarMonthView from '@/components/calendar/CalendarMonthView'
import CalendarWeekView from '@/components/calendar/CalendarWeekView'
import CalendarNewEventModal from '@/components/calendar/CalendarNewEventModal'
import CalendarRangeView from '@/components/calendar/CalendarRangeView'
import Legend from '@/components/calendar/CalendarLegend'
import CalendarFilters, { CalendarLN } from '@/components/calendar/CalendarFilters'
import { useSession } from 'next-auth/react'
import FilterButton from '@/components/ui/filter-button'
import FloatingAddButton from '@/components/ui/floating-add-button'
import { useFilters } from '@/context/FiltersContext'
import { loadXlsx } from '@/lib/loadXlsx'
import { printBrandedHtmlInNewWindow } from '@/lib/exportBranding'

import {
  addMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  parseISO,
} from 'date-fns'

/* ------------------------------ */
/* TYPES */
/* ------------------------------ */
type ViewMode = 'month' | 'week' | 'range'

type CalendarViewState = {
  mode: ViewMode
  ln: CalendarLN[]
  stage: string
  commercial: string[]
  codeStatus: string
  start: string
  end: string
  rangeMonths: number
}

type CalendarFilterChange = {
  ln?: CalendarLN[]
  stage?: string
  commercial?: string[]
  codeStatus?: string
}

type SessionUserLike = {
  role?: string | null
  department?: string | null
}

const STORAGE_KEY = 'calblay.calendar.filters.v1'
const toIso = (d: Date) => format(d, 'yyyy-MM-dd')
const EMPTY_FILTER_LIST: CalendarLN[] = []
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
const toArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is CalendarLN => typeof v === 'string' && Boolean(v.trim())
    )
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    const normalized = trimmed.toLowerCase()
    if (
      normalized === 'all' ||
      normalized.startsWith('tots') ||
      normalized.startsWith('totes')
    ) {
      return []
    }
    return [trimmed as CalendarLN]
  }
  return [] as CalendarLN[]
}

/* ------------------------------ */
/* ESTAT INICIAL */
/* ------------------------------ */
const makeInitialState = (): CalendarViewState => {
  const today = new Date()

  const base: CalendarViewState = {
    mode: 'month',
    ln: [],
    stage: 'all',
    commercial: [],
    codeStatus: 'all',
    start: toIso(startOfMonth(today)),
    end: toIso(endOfMonth(today)),
    rangeMonths: 6,
  }

  if (typeof window === 'undefined') return base

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return base
    const saved = JSON.parse(raw)
    return {
      ...base,
      ln: toArray(saved?.ln),
      stage: saved?.stage || 'all',
    }
  } catch {
    return base
  }
}

/* ------------------------------ */
/* COMPONENT */
/* ------------------------------ */
export default function CalendarPage() {
  const [state, setState] = useState<CalendarViewState>(makeInitialState)
  const { ln, stage, commercial, codeStatus, start, end, mode, rangeMonths } = state
  const { setOpen: openFiltersPanel, setContent } = useFilters()
  const arraysEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i])

  const applyFilterChange = useCallback((f: CalendarFilterChange) => {
    setState((prev) => {
      const nextLn = f.ln ?? prev.ln
      const nextStage = f.stage ?? prev.stage
      const nextCommercial = f.commercial ?? prev.commercial
      const nextCodeStatus = f.codeStatus ?? prev.codeStatus

      const changed =
        !arraysEqual(prev.ln, nextLn) ||
        prev.stage !== nextStage ||
        !arraysEqual(prev.commercial, nextCommercial) ||
        prev.codeStatus !== nextCodeStatus

      if (!changed) return prev
      return {
        ...prev,
        ln: nextLn,
        stage: nextStage,
        commercial: nextCommercial,
        codeStatus: nextCodeStatus,
      }
    })
  }, [])

  /* Persistència LN + Stage */
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ln, stage })
      )
    } catch {}
  }, [ln, stage])

  /* Dades calendari (finals) */
  const {
    deals,
    loading,
    error,
    reload,
  } = useCalendarData({
    ln,
    stage,
    commercial,
    start,
    end,
  })

  /* Dades per calcular filtres (sense commercial) */
  const { deals: dealsForFilters } = useCalendarData({
    ln,
    stage,
    commercial: EMPTY_FILTER_LIST,
    start,
    end,
  })

  /* Comercials disponibles */
  const comercialOptions = Array.from(
    new Set(
      dealsForFilters
        .map((d) => d.Comercial)
        .filter((x) => x && x.trim() !== '')
        .map((x) => x.trim())
    )
  ).sort()

  /* Netejar comercial si deixa de ser vàlid */
  useEffect(() => {
    if (!commercial.length) return
    const valid = commercial.filter((c) => comercialOptions.includes(c))
    if (valid.length !== commercial.length) {
      setState((prev) => ({
        ...prev,
        commercial: valid,
      }))
    }
  }, [commercial, ln, start, end, comercialOptions])

  /* Sessió */
  const { data: session } = useSession()
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

  const sessionUser = session?.user as SessionUserLike | undefined
  const role = normalize(String(sessionUser?.role || ''))
  const department = normalize(String(sessionUser?.department || ''))
  const isProductionOperationalWorker = role === 'treballador' && department === 'produccio'
  const canManageCodes =
    role === 'admin' ||
    (role.includes('cap') && department === 'produccio') ||
    isProductionOperationalWorker

  const codeCounts = useMemo(() => {
    const anchor = parseISO(start)
    const monthStart = startOfMonth(anchor)
    const monthEnd = endOfMonth(anchor)

    const inMonth = (d: (typeof deals)[number]) => {
      const s = d.DataInici || ''
      const e = d.DataFi || d.DataInici || ''
      if (!s) return false
      const sDate = parseISO(s)
      const eDate = parseISO(e)
      if (Number.isNaN(sDate.getTime()) || Number.isNaN(eDate.getTime()))
        return false
      return sDate <= monthEnd && eDate >= monthStart
    }

    const counts = { confirmed: 0, review: 0, missing: 0 }
    deals.filter(inMonth).forEach((d) => {
      const status = d.codeStatus
      if (status === 'review') counts.review += 1
      else if (status === 'confirmed') counts.confirmed += 1
      else counts.missing += 1
    })
    return counts
  }, [deals, start])

  const visibleDeals = useMemo(() => {
    if (!canManageCodes) return deals
    if (codeStatus === 'all') return deals
    return deals.filter((d) => d.codeStatus === codeStatus)
  }, [deals, codeStatus, canManageCodes])

  /* UI */
  const [syncing, setSyncing] = useState(false)
  const [syncingAda, setSyncingAda] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showLegend, setShowLegend] = useState(false)

  /* Obrir filtres */
  const openFilters = () => {
    setContent(
      <CalendarFilters
        ln={ln}
        stage={stage}
        commercial={commercial}
        codeStatus={codeStatus}
        showCodeStatus={canManageCodes}
        comercialOptions={comercialOptions}
        onChange={applyFilterChange}
        onReset={() =>
          setState((prev) => ({
            ...prev,
            ln: [],
            stage: 'all',
            commercial: [],
            codeStatus: 'all',
          }))
        }
      />
    )
    openFiltersPanel(true)
  }


  /* Detectar mobile */
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  /* Sync Zoho */
  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await fetch('/api/sync/zoho-to-firestore?mode=manual')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      alert(`Sincronització: ${json.updated} actualitzats, ${json.created} nous`)
      reload()
    } catch {
      alert('Error sincronitzant amb Zoho.')
    } finally {
      setSyncing(false)
    }
  }

  /* Navegació dates */
  const monthAnchor = parseISO(start)
  const monthLabel = monthAnchor.toLocaleDateString('ca-ES', {
    month: 'long',
    year: 'numeric',
  })

  const goToMonth = (delta: number) => {
    const base = startOfMonth(monthAnchor)
    const newBase = addMonths(base, delta)
    setState((prev) => ({
      ...prev,
      mode: 'month',
      start: toIso(startOfMonth(newBase)),
      end: toIso(endOfMonth(newBase)),
    }))
  }

  const goToWeek = (delta: number) => {
    const shifted = addDays(parseISO(start), delta * 7)
    setState((prev) => ({
      ...prev,
      mode: 'week',
      start: toIso(startOfWeek(shifted, { weekStartsOn: 1 })),
      end: toIso(endOfWeek(shifted, { weekStartsOn: 1 })),
    }))
  }

  const weekLabel =
    `${parseISO(start).toLocaleDateString('ca-ES', {
      day: 'numeric',
      month: 'short',
    })} - ${parseISO(end).toLocaleDateString('ca-ES', {
      day: 'numeric',
      month: 'short',
    })}`

  const switchToMonth = () => {
    const base = parseISO(start)
    setState((prev) => ({
      ...prev,
      mode: 'month',
      start: toIso(startOfMonth(base)),
      end: toIso(endOfMonth(base)),
    }))
  }

  const switchToWeek = () => {
    const base = parseISO(start)
    setState((prev) => ({
      ...prev,
      mode: 'week',
      start: toIso(startOfWeek(base, { weekStartsOn: 1 })),
      end: toIso(endOfWeek(base, { weekStartsOn: 1 })),
    }))
  }

  /* ------------------------------ */
  /* RENDER */
  /* ------------------------------ */
  const rangeLabel =
    `${parseISO(start).toLocaleDateString('ca-ES', {
      month: 'short',
      year: 'numeric',
    })} - ${parseISO(end).toLocaleDateString('ca-ES', {
      month: 'short',
      year: 'numeric',
    })}`

  const buildRange = (base: Date, months: number) => {
    const safeMonths = Math.max(1, months)
    const rangeStart = startOfMonth(base)
    const rangeEnd = endOfMonth(addMonths(rangeStart, safeMonths - 1))
    return {
      start: toIso(rangeStart),
      end: toIso(rangeEnd),
    }
  }

  /* Sync ADA */
  const handleSyncAda = async () => {
    try {
      setSyncingAda(true)
      const res = await fetch('/api/sync/ada-to-firestore?mode=manual')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      alert(
        `Sync ADA: ${json.updated} actualitzats (3/3: ${json.matched3}, 2/3: ${json.matched2})`
      )
      reload()
    } catch {
      alert('Error sincronitzant amb ADA.')
    } finally {
      setSyncingAda(false)
    }
  }

  const switchToRange = (months = rangeMonths) => {
    const base = parseISO(start)
    const next = buildRange(base, months)
    setState((prev) => ({
      ...prev,
      mode: 'range',
      rangeMonths: months,
      start: next.start,
      end: next.end,
      stage: prev.stage === 'all' ? 'confirmat' : prev.stage,
    }))
  }

  const goToRange = (delta: number) => {
    const base = startOfMonth(parseISO(start))
    const shifted = addMonths(base, delta * rangeMonths)
    const next = buildRange(shifted, rangeMonths)
    setState((prev) => ({
      ...prev,
      mode: 'range',
      start: next.start,
      end: next.end,
    }))
  }

  const setRangeMonths = (months: number) => {
    const base = parseISO(start)
    const next = buildRange(base, months)
    setState((prev) => ({
      ...prev,
      mode: 'range',
      rangeMonths: months,
      start: next.start,
      end: next.end,
      stage: prev.stage === 'all' ? 'confirmat' : prev.stage,
    }))
  }

  const exportPeriodLabel = mode === 'month' ? monthLabel : mode === 'week' ? weekLabel : rangeLabel

  const exportRows = useMemo(
    () =>
      visibleDeals.map((deal) => ({
        'Nom event': deal.NomEvent || '',
        Inici: deal.DataInici || '',
        Fi: deal.DataFi || '',
        Hora:
          deal.HoraInici && deal.HoraFi
            ? `${deal.HoraInici} - ${deal.HoraFi}`
            : deal.HoraInici || deal.HoraFi || '',
        Comercial: deal.Comercial || '',
        'Comercial intern': deal.ComercialIntern || '',
        Responsable: deal.Responsable || '',
        LN: deal.LN || '',
        Servei: deal.Servei || '',
        Etapa: deal.StageGroup || '',
        Ubicacio: deal.Ubicacio || '',
        Pax: deal.NumPax == null ? '' : String(deal.NumPax),
        Codi: deal.code || '',
        'Estat codi': deal.codeStatus || '',
        Origen: deal.origen || '',
        Observacions: deal.ObservacionsZoho || '',
      })),
    [visibleDeals]
  )

  const handleExportExcel = async () => {
    const XLSX = await loadXlsx()
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Calendari')
    const fileMode = mode === 'month' ? 'mes' : mode === 'week' ? 'setmana' : 'rang'
    XLSX.writeFile(wb, `calendari-${fileMode}.xlsx`)
  }

  const handleExportPdfView = () => {
    if (!visibleDeals.length) return
    window.print()
  }

  const buildPdfTableHtml = () => {
    const cols = [
      'Nom event',
      'Inici',
      'Fi',
      'Hora',
      'Comercial',
      'Comercial intern',
      'Responsable',
      'LN',
      'Servei',
      'Etapa',
      'Ubicacio',
      'Pax',
      'Codi',
      'Estat codi',
      'Origen',
      'Observacions',
    ] as const

    const header = cols.map((col) => `<th>${escapeHtml(col)}</th>`).join('')
    const body = exportRows
      .map((row) => {
        const cells = cols
          .map((key) => `<td>${escapeHtml(String(row[key] ?? ''))}</td>`)
          .join('')
        return `<tr>${cells}</tr>`
      })
      .join('')

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Calendari comercial</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
      h1 { font-size: 16px; margin-bottom: 8px; }
      .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; text-align: left; }
      th { background: #f3f4f6; }
      tr:nth-child(even) td { background: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Calendari comercial</h1>
    <div class="meta">Període: ${escapeHtml(exportPeriodLabel)}</div>
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>`
  }

  const handleExportPdfTable = () => {
    if (!exportRows.length) return
    printBrandedHtmlInNewWindow(buildPdfTableHtml())
  }

  const exportItems = [
    { label: 'Excel (.xlsx)', onClick: handleExportExcel, disabled: exportRows.length === 0 },
    { label: 'PDF (vista)', onClick: handleExportPdfView, disabled: visibleDeals.length === 0 },
    { label: 'PDF (taula)', onClick: handleExportPdfTable, disabled: exportRows.length === 0 },
  ]

  return (
    <div className="relative flex w-full flex-col lg:h-[calc(100dvh-3.5rem-1.5rem)] lg:min-h-[480px]">
      {/* CAPÇALERA */}
      <div className="mb-3 mt-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <CalendarDays size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold">
              Calendari comercial
            </h1>
            <p className="text-xs text-gray-500 hidden sm:block">
              Esdeveniments per línia de negoci i etapa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FilterButton onClick={openFilters} />
          <ExportMenu items={exportItems} ariaLabel="Exportar calendari" />
          {!isMobile && canManageCodes && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-1"
              >
                <RefreshCw
                  size={14}
                  className={syncing ? 'animate-spin text-blue-500' : ''}
                />
                {syncing ? 'Sincronitzant...' : 'Sincronitzar Zoho'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncAda}
                disabled={syncingAda}
                className="flex items-center gap-1"
              >
                <RefreshCw
                  size={14}
                  className={syncingAda ? 'animate-spin text-blue-500' : ''}
                />
                {syncingAda ? 'Sincronitzant...' : 'Sincronitzar ADA'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* LLEGENDA */}
      <button
        onClick={() => setShowLegend((v) => !v)}
        className="mb-2 flex shrink-0 items-center gap-1 text-xs text-gray-600 sm:text-sm"
      >
        {showLegend ? (
          <>Amagar llegenda <ChevronUp size={14} /></>
        ) : (
          <>Mostrar llegenda <ChevronDown size={14} /></>
        )}
      </button>

      {showLegend && (
        <div className="mb-2 shrink-0">
          <Legend
            showCodeStatus={canManageCodes}
            codeCounts={codeCounts}
          />
        </div>
      )}

      {/* MODE */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #calendar-print-root, #calendar-print-root * { visibility: visible; }
          #calendar-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            overflow: visible;
          }
          #calendar-print-root .overflow-x-auto,
          #calendar-print-root .overflow-hidden,
          #calendar-print-root .overflow-visible {
            overflow: visible !important;
          }
          #calendar-print-root .shadow-sm,
          #calendar-print-root .rounded-xl,
          #calendar-print-root .rounded-lg {
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="mb-3 flex shrink-0 items-center justify-between print:hidden">
        <div className="inline-flex bg-gray-100 rounded-full p-1">
          <button onClick={switchToMonth} className={`px-3 py-1 text-sm rounded-full ${mode === 'month' ? 'bg-white shadow' : ''}`}>Mes</button>
          <button onClick={switchToWeek} className={`px-3 py-1 text-sm rounded-full ${mode === 'week' ? 'bg-white shadow' : ''}`}>Setmana</button>
          <button onClick={() => switchToRange()} className={`px-3 py-1 text-sm rounded-full ${mode === 'range' ? 'bg-white shadow' : ''}`}>6-12 mesos</button>
        </div>

        {mode === 'month' ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => goToMonth(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <span className="capitalize">{monthLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => goToMonth(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        ) : mode === 'week' ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => goToWeek(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <span>{weekLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => goToWeek(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => goToRange(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <span className="capitalize">{rangeLabel}</span>
            <Button variant="ghost" size="icon" onClick={() => goToRange(1)}>
              <ChevronRight size={16} />
            </Button>
            <div className="inline-flex bg-gray-100 rounded-full p-1 text-xs">
              <button onClick={() => setRangeMonths(6)} className={`px-2 py-1 rounded-full ${rangeMonths === 6 ? 'bg-white shadow' : ''}`}>6m</button>
              <button onClick={() => setRangeMonths(12)} className={`px-2 py-1 rounded-full ${rangeMonths === 12 ? 'bg-white shadow' : ''}`}>12m</button>
            </div>
          </div>
        )}
      </div>

      {/* CONTINGUT */}
      {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}
      {loading && <p className="shrink-0 text-sm text-gray-500">Carregant dades...</p>}

      <div id="calendar-print-root" className="flex min-h-0 flex-1 flex-col print:block">
        <div className="hidden print:block">
          <h1 className="text-xl font-semibold">Calendari comercial</h1>
          <p className="text-sm text-gray-600">
            {mode === 'month' ? monthLabel : mode === 'week' ? weekLabel : rangeLabel}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm print:overflow-visible">
          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto print:overflow-visible">
            {mode === 'range' ? (
              <CalendarRangeView deals={visibleDeals} start={start} months={rangeMonths} />
            ) : mode === 'week' ? (
              <CalendarWeekView
                deals={visibleDeals}
                start={start}
                onCreated={reload}
                showCodeStatus={canManageCodes}
              />
            ) : (
              <CalendarMonthView
                deals={visibleDeals}
                start={start}
                onCreated={reload}
                showCodeStatus={canManageCodes}
              />
            )}
          </div>
        </div>
      </div>

      {/* ADD */}
      <CalendarNewEventModal
        date=""
        onSaved={reload}
        trigger={<FloatingAddButton onClick={() => {}} />}
      />
    </div>
  )
}





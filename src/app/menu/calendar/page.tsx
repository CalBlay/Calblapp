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

const STORAGE_KEY = 'calblay.calendar.filters.v1'
const toIso = (d: Date) => format(d, 'yyyy-MM-dd')
const EMPTY_FILTER_LIST: CalendarLN[] = []
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

  const applyFilterChange = (f: CalendarFilterChange) => {
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
  }

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

  const role = normalize(String(session?.user?.role || ''))
  const department = normalize(String((session?.user as any)?.department || ''))
  const canManageCodes =
    role === 'admin' || (role.includes('cap') && department === 'produccio')

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

  /* Render filtres (unic punt) */
  const renderFilters = useCallback(() => (
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
  ), [ln, stage, commercial, codeStatus, canManageCodes, comercialOptions])

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
  return (
    <div className="relative w-full">
      {/* CAPÇALERA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2 mb-3">
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
        className="text-xs sm:text-sm text-gray-600 mb-2 flex items-center gap-1"
      >
        {showLegend ? (
          <>Amagar llegenda <ChevronUp size={14} /></>
        ) : (
          <>Mostrar llegenda <ChevronDown size={14} /></>
        )}
      </button>

      {showLegend && (
        <Legend
          showCodeStatus={canManageCodes}
          codeCounts={codeCounts}
        />
      )}

      {/* MODE */}
      <div className="flex justify-between items-center mb-3">
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
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Carregant dades...</p>}

      <div className="rounded-xl bg-white border shadow-sm overflow-hidden">
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

      {/* ADD */}
      <CalendarNewEventModal
        date=""
        onSaved={reload}
        trigger={<FloatingAddButton onClick={() => {}} />}
      />
    </div>
  )
}





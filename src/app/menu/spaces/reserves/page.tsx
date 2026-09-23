// file: src/app/menu/spaces/reserves/page.tsx
'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { MotionDiv } from '@/lib/lazyMotion'
import { useSpaces, type SpaceApiRow } from '@/hooks/spaces/useSpaces'
import SpaceGrid from '@/components/spaces/SpaceGrid'
import SpaceMonthView from '@/components/spaces/SpaceMonthView'
import ModuleHeader from '@/components/layout/ModuleHeader'

import FilterButton from '@/components/ui/filter-button'
import {
  CorporateFilterField,
  CorporateFilterSearch,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { corporateFilterChipClass } from '@/lib/corporate-filters'
import { useFilters } from '@/context/FiltersContext'
import SpacesFilters, { type SpacesFilterState } from '@/components/spaces/SpacesFilters'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  SPACES_ACTION,
  SPACES_PREMISSES_PATH,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'
import SpacesSectionGate from '../SpacesSectionGate'
import FloatingAddButton from '@/components/ui/floating-add-button'
import SpacesManualReserveModal from '@/components/spaces/SpacesManualReserveModal'
import { PERM } from '@/lib/permissionKeys'
import {
  DEFAULT_SPACES_HEADER_RULE,
  type SpacesHeaderRuleConfig,
} from '@/lib/spacesHeaderRule'
import { countSpacesSearchEvents, filterSpacesRows } from '@/lib/spacesSearch'

type SpacesViewMode = 'week' | 'month'

const toISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`

const fromISODate = (value: string) => new Date(`${value}T12:00:00`)

export default function SpacesPage() {
  const { ready: permsReady, canEditPath, uiActions } = useUiPermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const canPremisses = !permsReady || canEditPath(SPACES_PREMISSES_PATH)
  const [headerRule, setHeaderRule] = useState<SpacesHeaderRuleConfig>(
    DEFAULT_SPACES_HEADER_RULE
  )

  // -------------------------------
  // ðŸ”¹ Estat de filtres
  // -------------------------------
  const [filters, setFilters] = useState<SpacesFilterState & {
    baseDate: string
    month: number
    year: number
    view: SpacesViewMode
  }>(() => {
    const today = new Date()
    return {
      stage: [],
      finca: [],
      comercial: [],
      ln: [],
      excludeGrupsRestaurants: true,
      baseDate: toISODate(today),  // Setmana inicial
      month: today.getMonth(),
      year: today.getFullYear(),
      view: 'week',
    }
  })

  // -------------------------------
  // ðŸ”¹ Carrega dades segons filtres
  // -------------------------------
const {
  spaces,
  totals,
  fincas,
  comercials,
  lns,        // âœ… AFEGIT
  loading,
  error,
} = useSpaces(filters, refreshKey)

  const canCreateManual =
    !permsReady ||
    canEditPath(SPACES_RESERVES_PATH) ||
    uiActions[
      PERM.action(SPACES_RESERVES_PATH, SPACES_ACTION.RESERVES_MANUAL_CREATE)
    ] === true

  const normalizedSpaces = useMemo<Array<{
    fincaId?: string
    isOwn?: boolean
    finca: string
    dies: Array<{ date: string; events: Array<Record<string, unknown>> }>
  }>>(
    () =>
      spaces.map((row: SpaceApiRow) => ({
        fincaId: row.fincaId,
        isOwn: row.isOwn,
        finca: row.finca ?? '',
        dies: Array.isArray(row.dies)
          ? row.dies.map((day) => ({
              date: day?.date ?? '',
              events: Array.isArray(day?.events) ? day.events : [],
            }))
          : [],
      })),
    [spaces]
  )

  const visibleSpaces = useMemo(
    () => filterSpacesRows(normalizedSpaces, deferredSearch),
    [deferredSearch, normalizedSpaces]
  )
  const visibleEventCount = useMemo(
    () => countSpacesSearchEvents(visibleSpaces),
    [visibleSpaces]
  )

  const monthFormatter = new Intl.DateTimeFormat('ca-ES', { month: 'long' })
  const monthOptions = Array.from({ length: 12 }, (_, month) => ({
    value: month,
    label: monthFormatter.format(new Date(2024, month, 1)),
  }))
  const yearOptions = Array.from({ length: 21 }, (_, i) => filters.year - 10 + i)


  // -------------------------------
  // ðŸ”¹ Control del panell de filtres
  // -------------------------------
  const { setOpen: openFilters, setContent: setFiltersContent } = useFilters()

  useEffect(() => {
    let cancelled = false

    const loadHeaderRule = async () => {
      try {
        const res = await fetch('/api/spaces/header-rule', { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) return
        if (!cancelled && json?.config) {
          setHeaderRule(json.config)
        }
      } catch {}
    }

    loadHeaderRule()
    return () => {
      cancelled = true
    }
  }, [])

  // -------------------------------
  // ðŸ”¹ Canvi de setmana
  // -------------------------------
  const shiftPeriod = (direction: 'prev' | 'next') => {
    setFilters(prev => {
      const base = fromISODate(prev.baseDate)
      if (prev.view === 'month') {
        base.setDate(1)
        base.setMonth(base.getMonth() + (direction === 'next' ? 1 : -1))
      } else {
        base.setDate(base.getDate() + (direction === 'next' ? 7 : -7))
      }

      return {
        ...prev,
        baseDate: toISODate(base),
        month: base.getMonth(),
        year: base.getFullYear(),
      }
    })
  }

  // -------------------------------
  // ðŸ”¹ Etiqueta setmana
  // -------------------------------
  const weekLabel = (() => {
    const base = fromISODate(filters.baseDate)
    const monday = new Date(base)
    const dow = monday.getDay() || 7
    if (dow !== 1) monday.setDate(monday.getDate() - (dow - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)

    const f = (d: Date) =>
      d.toLocaleDateString('ca-ES', {
        day: '2-digit',
        month: '2-digit'
      })

    return `${f(monday)} - ${f(sunday)}`
  })()

  const monthLabel = new Date(filters.year, filters.month, 1).toLocaleDateString(
    'ca-ES',
    { month: 'long', year: 'numeric' }
  )

  const setView = (view: SpacesViewMode) => {
    setFilters((prev) => ({
      ...prev,
      view,
      baseDate:
        view === 'month'
          ? toISODate(new Date(prev.year, prev.month, 1))
          : prev.baseDate,
    }))
  }

  const showWeekForDate = (date: string) => {
    const next = new Date(`${date}T12:00:00`)
    setFilters((prev) => ({
      ...prev,
      view: 'week',
      baseDate: date,
      month: next.getMonth(),
      year: next.getFullYear(),
    }))
  }

  const updateMonth = (nextMonth: number) => {
    setFilters(prev => {
      const base = fromISODate(prev.baseDate)
      const currentDay = base.getDate()
      const lastDay = new Date(prev.year, nextMonth + 1, 0).getDate()
      const nextDate = new Date(prev.year, nextMonth, Math.min(currentDay, lastDay))

      return {
        ...prev,
        month: nextMonth,
        baseDate: toISODate(nextDate),
      }
    })
  }

  const updateYear = (nextYear: number) => {
    setFilters(prev => {
      const base = fromISODate(prev.baseDate)
      const currentDay = base.getDate()
      const lastDay = new Date(nextYear, prev.month + 1, 0).getDate()
      const nextDate = new Date(nextYear, prev.month, Math.min(currentDay, lastDay))

      return {
        ...prev,
        year: nextYear,
        baseDate: toISODate(nextDate),
      }
    })
  }

  // -------------------------------
  // ðŸ”¹ Render
  // -------------------------------
  return (
    <SpacesSectionGate subpath={SPACES_RESERVES_PATH}>
      <ModuleHeader
        title="Espais"
        subtitle={`Reserves · Disponibilitat ${filters.view === 'month' ? 'mensual' : 'setmanal'} de finques`}
        actions={
          canPremisses ? (
            <Link
              href="/menu/spaces/premisses"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Premisses
            </Link>
          ) : undefined
        }
      />

      <section className="relative w-full min-h-0 bg-white pb-24 sm:pb-8">

        <CorporateFiltersShell
          variant="toolbar"
          className="mx-2 mb-2 mt-3 sm:mx-4 lg:mt-4"
          bodyClassName="flex-col gap-3 lg:flex-row lg:items-end"
        >
          <div
            className="flex rounded-lg bg-slate-100 p-1"
            role="group"
            aria-label="Vista de reserves"
          >
            <button
              type="button"
              onClick={() => setView('week')}
              className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none ${
                filters.view === 'week'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              aria-pressed={filters.view === 'week'}
            >
              Setmana
            </button>
            <button
              type="button"
              onClick={() => setView('month')}
              className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition sm:flex-none ${
                filters.view === 'month'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              aria-pressed={filters.view === 'month'}
            >
              Mes
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
            <button
              type="button"
              onClick={() => shiftPeriod('prev')}
              aria-label={filters.view === 'month' ? 'Mes anterior' : 'Setmana anterior'}
              className={corporateFilterChipClass}
            >
              {'<'}
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-slate-800 sm:flex-none sm:text-base">
              {filters.view === 'month' ? monthLabel : `Setmana: ${weekLabel}`}
            </span>
            <button
              type="button"
              onClick={() => shiftPeriod('next')}
              aria-label={filters.view === 'month' ? 'Mes següent' : 'Setmana següent'}
              className={corporateFilterChipClass}
            >
              {'>'}
            </button>
          </div>

          <CorporateFilterField label="Mes" className="shrink-0">
            <CorporateFilterSelect
              value={String(filters.month)}
              onChange={(e) => updateMonth(Number(e.target.value))}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>

          <CorporateFilterField label="Any" className="shrink-0">
            <CorporateFilterSelect
              value={String(filters.year)}
              onChange={(e) => updateYear(Number(e.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>

          <CorporateFilterField
            label="Cerca intel·ligent"
            className="min-w-0 flex-1 lg:min-w-[280px]"
          >
            <CorporateFilterSearch
              id="spaces-reserves-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearch('')
              }}
              placeholder="Finca, event, client, comercial, codi..."
              aria-label="Cerca intel·ligent de reserves d'espais"
              autoComplete="off"
            />
          </CorporateFilterField>

          <div className="flex justify-end">
            <FilterButton
              onClick={() => {
                setFiltersContent(
                  <SpacesFilters
                    value={filters}
                    fincas={fincas}
                    comercials={comercials}
                    lns={lns}
                    onChange={(patch) =>
                      setFilters((prev) => ({
                        ...prev,
                        ...patch,
                      }))
                    }
                  />
                )
                openFilters(true)
              }}
            />
          </div>
        </CorporateFiltersShell>

        {search.trim() && !loading ? (
          <div className="mx-2 flex items-center justify-between gap-3 px-1 text-xs text-slate-500 sm:mx-4">
            <span>
              {visibleEventCount === 1
                ? '1 coincidència visible'
                : `${visibleEventCount} coincidències visibles`}
            </span>
            <button
              type="button"
              onClick={() => setSearch('')}
              className="font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              Neteja la cerca
            </button>
          </div>
        ) : null}

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
             â³ Loading
           â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {loading && (
          <MotionDiv
            className="mt-10 flex flex-col gap-3 items-center"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1.2, repeatType: 'reverse' }}
          >
            <div className="h-6 w-40 bg-gray-200 rounded" />
            <div className="h-4 w-60 bg-gray-100 rounded" />
          </MotionDiv>
        )}

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
             ðŸ§© Taula de dades
           â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!loading && (
          filters.view === 'month' ? (
            <SpaceMonthView
              data={visibleSpaces}
              month={filters.month}
              year={filters.year}
              headerRule={headerRule}
              emptyMessage={
                deferredSearch.trim()
                  ? 'Cap reserva coincideix amb la cerca en aquest mes.'
                  : undefined
              }
              onShowWeek={showWeekForDate}
              onEventMutated={() => setRefreshKey((value) => value + 1)}
            />
          ) : (
            <SpaceGrid
              data={visibleSpaces}
              totals={totals}
              baseDate={filters.baseDate}
              headerRule={headerRule}
              emptyMessage={
                deferredSearch.trim()
                  ? 'Cap reserva coincideix amb la cerca en aquesta setmana.'
                  : undefined
              }
              onEventMutated={() => setRefreshKey((value) => value + 1)}
            />
          )
        )}

        {!loading && error && (
          <div className="mx-4 mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {canCreateManual && (
          <SpacesManualReserveModal
            defaultDate={filters.baseDate}
            onSaved={() => setRefreshKey((value) => value + 1)}
            trigger={<FloatingAddButton onClick={() => {}} />}
          />
        )}

      </section>
    </SpacesSectionGate>
  )
}

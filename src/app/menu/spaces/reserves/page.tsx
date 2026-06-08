// file: src/app/menu/spaces/reserves/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useSpaces, type SpaceApiRow } from '@/hooks/spaces/useSpaces'
import SpaceGrid from '@/components/spaces/SpaceGrid'
import ModuleHeader from '@/components/layout/ModuleHeader'

import FilterButton from '@/components/ui/filter-button'
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

export default function SpacesPage() {
  const { ready: permsReady, canEditPath, uiActions } = useUiPermissions()
  const [refreshKey, setRefreshKey] = useState(0)
  const canPremisses = !permsReady || canEditPath(SPACES_PREMISSES_PATH)
  const toISODate = (date: Date) => date.toISOString().split('T')[0]
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

  const normalizedSpaces: Array<{
    fincaId?: string
    finca: string
    dies: Array<{ date: string; events: Array<Record<string, unknown>> }>
  }> = spaces.map((row: SpaceApiRow) => ({
    fincaId: row.fincaId,
    finca: row.finca ?? '',
    dies: Array.isArray(row.dies)
      ? row.dies.map((day) => ({
          date: day?.date ?? '',
          events: Array.isArray(day?.events) ? day.events : [],
        }))
      : [],
  }))

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
  const shiftWeek = (direction: 'prev' | 'next') => {
    setFilters(prev => {
      const base = new Date(prev.baseDate)
      base.setDate(base.getDate() + (direction === 'next' ? 7 : -7))

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
    const base = new Date(filters.baseDate)
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

  const updateMonth = (nextMonth: number) => {
    setFilters(prev => {
      const base = new Date(prev.baseDate)
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
      const base = new Date(prev.baseDate)
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
        subtitle="Reserves · Disponibilitat setmanal de finques"
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

        {/* Controls de setmana + Filtres */}
        <div className="mb-2 mt-3 flex flex-col gap-3 px-2 sm:px-4 lg:mt-4 lg:flex-row lg:items-center lg:justify-between">

          {/* Controls esquerra */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:gap-4">
            <div className="flex items-center justify-between gap-2 sm:justify-start sm:gap-3">
              <button
                type="button"
                onClick={() => shiftWeek('prev')}
                aria-label="Setmana anterior"
                className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-gray-100 px-3 text-base font-semibold hover:bg-gray-200"
              >
                {'<'}
              </button>

              <span className="flex-1 text-center text-sm font-semibold text-gray-700 sm:flex-none sm:text-base lg:text-lg">
                Setmana: {weekLabel}
              </span>

              <button
                type="button"
                onClick={() => shiftWeek('next')}
                aria-label="Setmana següent"
                className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-gray-100 px-3 text-base font-semibold hover:bg-gray-200"
              >
                {'>'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
              <label className="flex min-h-11 flex-col justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 sm:min-h-0 sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Mes</span>
                <select
                  value={filters.month}
                  onChange={(e) => updateMonth(Number(e.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-2 text-sm sm:h-auto sm:w-auto sm:py-1 sm:text-xs"
                >
                  {monthOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex min-h-11 flex-col justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 sm:min-h-0 sm:flex-row sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Any</span>
                <select
                  value={filters.year}
                  onChange={(e) => updateYear(Number(e.target.value))}
                  className="h-10 w-full rounded-md border bg-white px-2 text-sm sm:h-auto sm:w-auto sm:py-1 sm:text-xs"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Botó filtres */}
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
                    setFilters(prev => ({
                      ...prev,
                      ...patch
                    }))
                  }
                />
              )
              openFilters(true)
            }}
            />
          </div>
        </div>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
             â³ Loading
           â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {loading && (
          <motion.div
            className="mt-10 flex flex-col gap-3 items-center"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ repeat: Infinity, duration: 1.2, repeatType: 'reverse' }}
          >
            <div className="h-6 w-40 bg-gray-200 rounded" />
            <div className="h-4 w-60 bg-gray-100 rounded" />
          </motion.div>
        )}

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
             ðŸ§© Taula de dades
           â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {!loading && (
          <SpaceGrid
            data={normalizedSpaces}
            totals={totals}
            baseDate={filters.baseDate}
            headerRule={headerRule}
            onEventMutated={() => setRefreshKey((value) => value + 1)}
          />
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


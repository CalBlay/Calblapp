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
        title="Espais / Reserves"
        subtitle="Disponibilitat setmanal de finques"
        actions={
          canPremisses ? (
            <Link
              href="/menu/spaces/premisses"
              className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Premisses
            </Link>
          ) : undefined
        }
      />

      <section className="relative w-full h-full bg-white">

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
             ðŸ“… Controls de setmana + Filtres
           â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex items-center justify-between mt-4 mb-2 px-4">

          {/* Controls esquerra */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => shiftWeek('prev')}
                className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
              >
                {'<'}
              </button>

              <span className="font-semibold text-gray-700 text-sm sm:text-base">
                Setmana: {weekLabel}
              </span>

              <button
                onClick={() => shiftWeek('next')}
                className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
              >
                {'>'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Mes</span>
              <select
                value={filters.month}
                onChange={(e) => updateMonth(Number(e.target.value))}
                className="border rounded-md px-2 py-1 text-xs bg-white"
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <span className="text-xs font-semibold text-gray-500">Any</span>
              <select
                value={filters.year}
                onChange={(e) => updateYear(Number(e.target.value))}
                className="border rounded-md px-2 py-1 text-xs bg-white"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* BotÃ³ filtres */}
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


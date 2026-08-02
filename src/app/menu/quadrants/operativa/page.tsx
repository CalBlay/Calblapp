'use client'

import React from 'react'
import Link from 'next/link'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { ClipboardList } from 'lucide-react'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { CorporateFiltersShell, CorporateFilterField, CorporateFilterSelect } from '@/components/layout/corporate-filters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import QuadrantsLnFilterBadges from '../components/QuadrantsLnFilterBadges'
import QuadrantsLinesTable from '../components/QuadrantsLinesTable'
import { useQuadrantsDashboardPage } from '../hooks/useQuadrantsDashboardPage'

export default function QuadrantsOperativaPage() {
  const { setContent, setOpen } = useFilters()
  const dashboard = useQuadrantsDashboardPage()

  const handleDatesChange = (f: SmartFiltersChange) => {
    if (f.start) {
      const base = new Date(f.start)
      const weekStart = startOfWeek(base, { weekStartsOn: 1 })
      const weekEnd = endOfWeek(base, { weekStartsOn: 1 })
      dashboard.setFilters((prev) => ({
        ...prev,
        start: format(weekStart, 'yyyy-MM-dd'),
        end: format(weekEnd, 'yyyy-MM-dd'),
        mode: 'week',
      }))
    }
  }

  const openFiltersPanel = () => {
    setContent(
      <div key={`quadrants-operativa-filters-${dashboard.dateResetSignal}`} className="flex flex-col gap-4 p-4">
        <CorporateFilterField label="Responsable">
          <CorporateFilterSelect
            className="w-full"
            minWidthClassName="min-w-0"
            value={dashboard.filters.responsable ?? '__all__'}
            onChange={(e) => dashboard.setFilters((prev) => ({ ...prev, responsable: e.target.value }))}
          >
            <option value="__all__">Tots</option>
            {dashboard.responsables.map((o) => (
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
            value={dashboard.filters.location ?? '__all__'}
            onChange={(e) => dashboard.setFilters((prev) => ({ ...prev, location: e.target.value }))}
          >
            <option value="__all__">Totes</option>
            {dashboard.locations.map((o) => (
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
            value={dashboard.filters.status ?? '__all__'}
            onChange={(e) => dashboard.setFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="__all__">Tots</option>
            <option value="pending">Pendents</option>
            <option value="draft">Esborranys</option>
            <option value="confirmed">Confirmats</option>
          </CorporateFilterSelect>
        </CorporateFilterField>
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <ResetFilterButton
            onClick={() => {
              dashboard.resetFilters()
              setOpen(false)
            }}
          />
        </div>
      </div>
    )
    setOpen(true)
  }

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
        icon={<ClipboardList className="h-7 w-7 text-indigo-600" />}
        title="Quadrants"
        subtitle="Vista operativa per línies"
        actions={
          <Link
            href="/menu/quadrants"
            className={cn(typography('bodyMd'), 'whitespace-nowrap font-medium hover:underline')}
          >
            Tauler de treball
          </Link>
        }
      />

      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-1', typography('bodyMd'))}>
        <span>Total assignacions: {dashboard.totalVisible}</span>
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
          resetSignal={dashboard.dateResetSignal}
          initialStart={dashboard.filters.start}
          initialEnd={dashboard.filters.end}
          compact
        />
        <QuadrantsLnFilterBadges
          value={dashboard.filters.ln || 'all'}
          onChange={(ln) => dashboard.setFilters((prev) => ({ ...prev, ln }))}
        />
        <div className="min-w-[8px] flex-1" />
        <FilterButton onClick={openFiltersPanel} />
      </CorporateFiltersShell>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => dashboard.toggleStatusFilter('pending')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              dashboard.filters.status === 'pending'
                ? 'border-yellow-300 bg-yellow-50 text-yellow-800 ring-2 ring-yellow-300/60'
                : 'border-transparent bg-yellow-50/60 text-yellow-700 hover:bg-yellow-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            Pendents: {dashboard.visibleCounts.pending}
          </button>
          <button
            type="button"
            onClick={() => dashboard.toggleStatusFilter('draft')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              dashboard.filters.status === 'draft'
                ? 'border-blue-300 bg-blue-50 text-blue-800 ring-2 ring-blue-300/60'
                : 'border-transparent bg-blue-50/60 text-blue-700 hover:bg-blue-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            Esborranys: {dashboard.visibleCounts.draft}
          </button>
          <button
            type="button"
            onClick={() => dashboard.toggleStatusFilter('confirmed')}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
              dashboard.filters.status === 'confirmed'
                ? 'border-green-300 bg-green-50 text-green-800 ring-2 ring-green-300/60'
                : 'border-transparent bg-green-50/60 text-green-700 hover:bg-green-50'
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            Confirmats: {dashboard.visibleCounts.confirmed}
          </button>
          {dashboard.statusFilterActive ? (
            <button
              type="button"
              onClick={() => dashboard.setFilters((prev) => ({ ...prev, status: '__all__' }))}
              className={cn(
                typography('bodySm'),
                'rounded-full border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50'
              )}
            >
              Mostrar tots
            </button>
          ) : null}
        </div>
        {dashboard.isCuinaDepartment ? (
          <label className={cn('flex items-center gap-2', typography('bodyXs'), 'text-slate-700')}>
            <input
              type="checkbox"
              checked={dashboard.hideCuinaMinorServices}
              onChange={(e) => dashboard.setHideCuinaMinorServices(e.target.checked)}
            />
            Amaga Coffee, Menu entregues i Cheers &lt; 200 PAX
          </label>
        ) : null}
      </div>

      {dashboard.loading && (
        <p className={cn('py-10 text-center', typography('bodySm'), 'text-gray-500')}>
          Carregant quadrants…
        </p>
      )}

      {Boolean(dashboard.error) && (
        <p className={cn('py-10 text-center text-red-600', typography('bodySm'))}>
          {String(dashboard.error)}
        </p>
      )}

      {!dashboard.loading && !dashboard.error && !dashboard.hasContent && (
        <p className={cn('py-10 text-center text-gray-400', typography('bodySm'))}>
          Cap esdeveniment trobat per aquest rang de dates.
        </p>
      )}

      {!dashboard.loading && !dashboard.error && dashboard.hasContent && (
        <QuadrantsLinesTable
          groupedByDay={dashboard.groupedLines}
          surveyKeySet={dashboard.surveyKeySet}
          phasesByEventId={dashboard.phasesByEventId}
          phaseOptions={dashboard.phaseOptions}
          expandedId={dashboard.expandedId}
          onExpandedIdChange={dashboard.setExpandedId}
          department={dashboard.department}
          onRefreshDrafts={dashboard.reload}
        />
      )}
    </main>
  )
}

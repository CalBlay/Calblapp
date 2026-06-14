'use client'

import { useMemo } from 'react'
import { History } from 'lucide-react'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import {
  CorporateFilterBadgeGroup,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import type { FiltersState } from '@/components/layout/FiltersBar'
import { colorByLN } from '@/lib/colors'
import { corporateFilterChipClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

type LnKey = 'empresa' | 'casaments' | 'foodlovers' | 'agenda' | 'altres'

type Props = {
  filters: FiltersState
  setFilters: (next: Partial<FiltersState>) => void
  onReset: () => void
  resetSignal: number
  lnOptions: LnKey[]
  responsables: string[]
  commercials: string[]
  locations: string[]
  minimal?: boolean
  historyMode?: boolean
  onHistoryModeChange?: (value: boolean) => void
}

const ALL = '__all__'

const formatLnLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1)

const compactSelectClass =
  'h-9 max-w-[9.5rem] truncate px-2.5 text-xs font-medium sm:max-w-[10.5rem] sm:text-sm'

function FilterDivider() {
  return <div className="hidden h-7 w-px shrink-0 bg-slate-200 sm:block" aria-hidden />
}

export default function EventsFiltersBar({
  filters,
  setFilters,
  onReset,
  resetSignal,
  lnOptions,
  responsables,
  commercials,
  locations,
  minimal = false,
  historyMode = false,
  onHistoryModeChange,
}: Props) {
  const handleSmartFiltersChange = (change: SmartFiltersChange) => {
    const next: Partial<FiltersState> = {}
    if (change.start) next.start = change.start
    if (change.end) next.end = change.end
    if (change.mode === 'week' || change.mode === 'day' || change.mode === 'range') {
      next.mode = change.mode
    }
    setFilters(next)
  }

  const lnBadgeOptions = useMemo(
    () =>
      lnOptions.map((key) => ({
        value: key,
        label: formatLnLabel(key),
        className: colorByLN(key),
      })),
    [lnOptions]
  )

  return (
    <CorporateFiltersShell
      variant="toolbar"
      showHeader={false}
      sticky
      className="w-full"
      bodyClassName="overflow-x-auto px-3 py-2.5 sm:px-4 lg:px-5"
    >
      <div className="flex min-w-max items-center gap-2 sm:gap-2.5 lg:min-w-0 lg:w-full lg:flex-nowrap">
        <div className="shrink-0">
          <SmartFilters
            modeDefault="week"
            modeOptions={['week', 'day', 'month', 'year', 'range']}
            role="Direcció"
            showDepartment={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showImportance={false}
            showAdvanced={false}
            compact
            onChange={handleSmartFiltersChange}
            resetSignal={resetSignal}
            initialStart={filters.start}
            initialEnd={filters.end}
          />
        </div>

        {minimal && onHistoryModeChange ? (
          <>
            <FilterDivider />
            <button
              type="button"
              className={cn(
                corporateFilterChipClass,
                'inline-flex h-9 items-center gap-2 px-3 text-xs font-semibold sm:text-sm',
                historyMode && 'border-sky-300 bg-sky-50 text-sky-900 ring-1 ring-sky-200'
              )}
              onClick={() => onHistoryModeChange(!historyMode)}
              aria-pressed={historyMode}
              title={historyMode ? 'Tornar a comandes actives' : 'Veure historial de comandes enviades'}
            >
              <History className="h-4 w-4 shrink-0" />
              Historial
            </button>
          </>
        ) : null}

        {!minimal && lnBadgeOptions.length > 0 ? (
          <>
            <FilterDivider />
            <div className="min-w-0 shrink overflow-x-auto">
              <CorporateFilterBadgeGroup
                label="LN"
                value={filters.ln || ALL}
                onChange={(value) => setFilters({ ln: value })}
                allLabel="Totes"
                allValue={ALL}
                options={lnBadgeOptions}
                className="flex-nowrap"
              />
            </div>
          </>
        ) : null}

        {!minimal && responsables.length > 0 ? (
          <>
            <FilterDivider />
            <CorporateFilterSelect
              aria-label="Responsable"
              title="Responsable"
              value={filters.responsable ?? ALL}
              onChange={(e) => setFilters({ responsable: e.target.value })}
              minWidthClassName="min-w-[7.5rem]"
              className={compactSelectClass}
            >
              <option value={ALL}>Responsable</option>
              {responsables.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </CorporateFilterSelect>
          </>
        ) : null}

        {!minimal && commercials.length > 0 ? (
          <CorporateFilterSelect
            aria-label="Comercial"
            title="Comercial"
            value={filters.commercial ?? ALL}
            onChange={(e) => setFilters({ commercial: e.target.value })}
            minWidthClassName="min-w-[7.5rem]"
            className={compactSelectClass}
          >
            <option value={ALL}>Comercial</option>
            {commercials.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </CorporateFilterSelect>
        ) : null}

        {!minimal && locations.length > 0 ? (
          <CorporateFilterSelect
            aria-label="Ubicació"
            title="Ubicació"
            value={filters.location ?? ALL}
            onChange={(e) => setFilters({ location: e.target.value })}
            minWidthClassName="min-w-[7.5rem]"
            className={cn(compactSelectClass, 'sm:max-w-[12rem]')}
          >
            <option value={ALL}>Ubicació</option>
            {locations.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </CorporateFilterSelect>
        ) : null}

        <div className="min-w-2 flex-1" />

        <ResetFilterButton onClick={onReset} />
      </div>
    </CorporateFiltersShell>
  )
}

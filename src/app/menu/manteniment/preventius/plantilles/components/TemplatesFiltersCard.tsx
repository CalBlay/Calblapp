'use client'

import FilterButton from '@/components/ui/filter-button'
import { typography } from '@/lib/typography'
import { PERIODICITY_OPTIONS } from '../types'

type Props = {
  embedded: boolean
  filteredCount: number
  periodicity: string
  search: string
  onSearchChange: (value: string) => void
  onPeriodicityChange: (value: string) => void
}

export default function TemplatesFiltersCard({
  embedded,
  filteredCount,
  periodicity,
  search,
  onSearchChange,
  onPeriodicityChange,
}: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className={typography('sectionTitle')}>Preventius</div>
            <div className={`mt-1 flex flex-wrap items-center gap-2 ${typography('bodyXs')}`}>
              <span>{filteredCount} resultats</span>
              {periodicity !== 'all' ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                  {PERIODICITY_OPTIONS.find((option) => option.value === periodicity)?.label || periodicity}
                </span>
              ) : null}
            </div>
          </div>
          {!embedded ? (
            <div className="shrink-0 lg:hidden">
              <FilterButton onClick={() => undefined} />
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 lg:min-w-[420px]">
          <div className="w-full">
            <input
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              placeholder="Cerca per nom, ubicacio o operari"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          {!embedded ? (
            <div className="hidden shrink-0 lg:block">
              <FilterButton onClick={() => undefined} />
            </div>
          ) : null}
          {embedded ? (
            <select
              className="h-11 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              value={periodicity}
              onChange={(event) => onPeriodicityChange(event.target.value)}
            >
              {PERIODICITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
    </div>
  )
}

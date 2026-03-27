'use client'

import FilterButton from '@/components/ui/filter-button'

type ModeOption = {
  value: string
  label: string
}

type Props = {
  rangeLabel?: string
  onPrev?: () => void
  onNext?: () => void
  modeValue?: string
  modeOptions?: ModeOption[]
  onModeChange?: (value: string) => void
  onOpenFilters?: () => void
  rightSlot?: React.ReactNode
}

export default function MaintenanceToolbar({
  rangeLabel,
  onPrev,
  onNext,
  modeValue,
  modeOptions,
  onModeChange,
  onOpenFilters,
  rightSlot,
}: Props) {
  const hasDateNav = Boolean(rangeLabel)
  const hasModeSelect = Boolean(modeValue && modeOptions?.length && onModeChange)
  const hasLeftControls = hasDateNav || hasModeSelect

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={`flex min-w-0 flex-wrap items-center gap-3 ${hasLeftControls ? '' : 'lg:hidden'}`}>
          {hasDateNav ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <button
                type="button"
                onClick={onPrev}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              >
                {'<'}
              </button>
              <span className="min-w-[140px] text-center sm:min-w-[170px]">{rangeLabel}</span>
              <button
                type="button"
                onClick={onNext}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              >
                {'>'}
              </button>
            </div>
          ) : null}

          {hasModeSelect ? (
            <select
              value={modeValue}
              onChange={(e) => onModeChange?.(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              {modeOptions?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className={`flex flex-wrap items-center gap-2 ${hasLeftControls ? 'justify-end' : 'justify-start lg:w-full'}`}>
          {rightSlot}
          {onOpenFilters ? <FilterButton onClick={onOpenFilters} /> : null}
        </div>
      </div>
    </div>
  )
}

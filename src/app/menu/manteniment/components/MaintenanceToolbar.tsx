'use client'

import FilterButton from '@/components/ui/filter-button'
import { cn } from '@/lib/utils'

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
  leftSlot?: React.ReactNode
  centerSlot?: React.ReactNode
  rightSlot?: React.ReactNode
  bottomSlot?: React.ReactNode
  className?: string
  bodyClassName?: string
}

export default function MaintenanceToolbar({
  rangeLabel,
  onPrev,
  onNext,
  modeValue,
  modeOptions,
  onModeChange,
  onOpenFilters,
  leftSlot,
  centerSlot,
  rightSlot,
  bottomSlot,
  className,
  bodyClassName,
}: Props) {
  const hasDateNav = Boolean(rangeLabel)
  const hasModeSelect = Boolean(modeValue && modeOptions?.length && onModeChange)
  const hasLeftControls = hasDateNav || hasModeSelect || leftSlot

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm', className)}>
      <div className={cn('flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', bodyClassName)}>
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

          {leftSlot}
        </div>

        {centerSlot ? <div className="min-w-[240px] flex-1">{centerSlot}</div> : null}

        <div className={`flex flex-wrap items-center gap-2 ${hasLeftControls || centerSlot ? 'justify-end' : 'justify-start lg:w-full'}`}>
          {rightSlot}
          {onOpenFilters ? <FilterButton onClick={onOpenFilters} /> : null}
        </div>
      </div>

      {bottomSlot ? <div className="mt-3">{bottomSlot}</div> : null}
    </div>
  )
}

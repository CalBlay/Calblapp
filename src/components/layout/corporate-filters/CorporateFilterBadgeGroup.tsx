'use client'

import { cn } from '@/lib/utils'
import { corporateFilterBadgeClass, corporateFilterLabelClass } from '@/lib/corporate-filters'

export type CorporateFilterBadgeOption = {
  value: string
  label: string
  className?: string
}

type Props = {
  label?: string
  value: string
  onChange: (value: string) => void
  options: CorporateFilterBadgeOption[]
  allLabel?: string
  allValue?: string
  className?: string
}

export default function CorporateFilterBadgeGroup({
  label,
  value,
  onChange,
  options,
  allLabel = 'Totes',
  allValue = 'all',
  className,
}: Props) {
  const selected = value || allValue

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {label ? <span className={cn(corporateFilterLabelClass, 'shrink-0')}>{label}</span> : null}
      <button
        type="button"
        onClick={() => onChange(allValue)}
        className={corporateFilterBadgeClass(selected === allValue)}
      >
        {allLabel}
      </button>
      {options.map((option) => {
        const active = selected === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(active ? allValue : option.value)}
            className={corporateFilterBadgeClass(active, option.className)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

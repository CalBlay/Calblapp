'use client'

import { colorByLN } from '@/lib/colors'
import { INCIDENTS_LN_OPTIONS } from '@/lib/incidentLn'
import CorporateFilterBadgeGroup from '@/components/layout/corporate-filters/CorporateFilterBadgeGroup'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (ln: string) => void
  className?: string
}

export default function IncidentsLnFilterBadges({ value, onChange, className }: Props) {
  const selected = value || 'all'

  return (
    <CorporateFilterBadgeGroup
      label="LN"
      value={selected}
      onChange={onChange}
      allLabel="Totes"
      allValue="all"
      className={cn('flex-nowrap', className)}
      options={INCIDENTS_LN_OPTIONS.map((opt) => ({
        value: opt.key,
        label: opt.label,
        className: selected === opt.key ? colorByLN(opt.key) : undefined,
      }))}
    />
  )
}

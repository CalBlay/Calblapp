'use client'

import { colorByLN } from '@/lib/colors'
import { INCIDENTS_LN_OPTIONS } from '@/lib/incidentLn'
import CorporateFilterBadgeGroup from '@/components/layout/corporate-filters/CorporateFilterBadgeGroup'

type Props = {
  value: string
  onChange: (ln: string) => void
}

export default function QuadrantsLnFilterBadges({ value, onChange }: Props) {
  const selected = value || 'all'

  return (
    <CorporateFilterBadgeGroup
      label="LN"
      value={selected}
      onChange={onChange}
      allLabel="Totes"
      allValue="all"
      options={INCIDENTS_LN_OPTIONS.map((opt) => ({
        value: opt.key,
        label: opt.label,
        className: selected === opt.key ? colorByLN(opt.key) : undefined,
      }))}
    />
  )
}

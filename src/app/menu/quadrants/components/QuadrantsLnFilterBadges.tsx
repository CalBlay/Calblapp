'use client'

import { useMemo } from 'react'
import { colorByLN } from '@/lib/colors'
import { INCIDENTS_LN_OPTIONS } from '@/lib/incidentLn'
import { corporateFilterBadgeClass } from '@/lib/corporate-filters'

type Props = {
  value: string
  onChange: (ln: string) => void
}

function parseSelectedLn(value: string): Set<string> {
  const raw = String(value || '').trim()
  if (!raw || raw === 'all') return new Set()
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  )
}

export default function QuadrantsLnFilterBadges({ value, onChange }: Props) {
  const selected = useMemo(() => parseSelectedLn(value), [value])

  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(next.size === 0 ? 'all' : [...next].join(','))
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
      {INCIDENTS_LN_OPTIONS.map((opt) => {
        const active = selected.has(opt.key)
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => toggle(opt.key)}
            className={corporateFilterBadgeClass(active, active ? colorByLN(opt.key) : undefined)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

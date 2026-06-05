'use client'

import { colorByLN } from '@/lib/colors'
import { INCIDENTS_LN_OPTIONS } from '@/lib/incidentLn'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  onChange: (ln: string) => void
}

export default function IncidentsLnFilterBadges({ value, onChange }: Props) {
  const selected = value || 'all'

  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      <span className={cn(typography('label'), 'shrink-0 text-gray-500')}>LN</span>
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
          selected === 'all'
            ? 'border-slate-400 bg-slate-100 text-slate-800 ring-1 ring-slate-300'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
        )}
      >
        Totes
      </button>
      {INCIDENTS_LN_OPTIONS.map((opt) => {
        const active = selected === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(active ? 'all' : opt.key)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
              colorByLN(opt.key),
              active && 'ring-2 ring-offset-1 ring-slate-500'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

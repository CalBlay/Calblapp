'use client'

type KindFilter = 'all' | 'preventiu' | 'ticket'

type Props = {
  value: KindFilter
  onChange: (value: KindFilter) => void
  workerChip?: string | null
  statusChip?: string | null
}

const OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: 'preventiu', label: 'Preventius' },
  { value: 'ticket', label: 'Tickets' },
  { value: 'all', label: 'Tots' },
]

export default function JourneyKindFilter({ value, onChange, workerChip, statusChip }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="inline-flex w-full max-w-full rounded-full border border-slate-200 bg-white p-1 sm:w-auto">
        {OPTIONS.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`min-h-[44px] flex-1 rounded-full px-4 py-2 text-sm font-semibold transition touch-manipulation sm:flex-none ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 active:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {workerChip ? (
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
          {workerChip}
        </span>
      ) : null}
      {statusChip ? (
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
          {statusChip}
        </span>
      ) : null}
    </div>
  )
}

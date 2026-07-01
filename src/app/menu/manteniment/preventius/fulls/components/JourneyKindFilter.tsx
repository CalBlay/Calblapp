'use client'

import { getStatusLabel } from '../lib/status'

type KindFilter = 'all' | 'preventiu' | 'ticket'

type Props = {
  value: KindFilter
  onChange: (value: KindFilter) => void
  workerChip?: string | null
  statusValue: string
  onStatusChange: (value: string) => void
  statusOptions: string[]
  searchChip?: string | null
}

const OPTIONS: Array<{ value: KindFilter; label: string }> = [
  { value: 'preventiu', label: 'Preventius' },
  { value: 'ticket', label: 'Tickets' },
]

export default function JourneyKindFilter({
  value,
  onChange,
  workerChip,
  statusValue,
  onStatusChange,
  statusOptions,
  searchChip,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="inline-flex w-full max-w-full rounded-full border border-slate-200 bg-white p-1 sm:w-auto">
        {OPTIONS.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(active ? 'all' : option.value)}
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
      {statusOptions.map((status) => {
        const active = statusValue === status
        return (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(active ? 'all' : status)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {status === 'espera' ? 'En pausa' : getStatusLabel(status, status)}
          </button>
        )
      })}
      {workerChip ? (
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
          {workerChip}
        </span>
      ) : null}
      {searchChip ? (
        <span className="max-w-full truncate rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
          {searchChip}
        </span>
      ) : null}
    </div>
  )
}

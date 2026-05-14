'use client'

import { Button } from '@/components/ui/button'

type Props = {
  visible: boolean
  dates: string[]
  selectedDates: string[]
  setSelectedDates: (dates: string[]) => void
}

const formatDay = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export default function MultiDayDateSelector({
  visible,
  dates,
  selectedDates,
  setSelectedDates,
}: Props) {
  if (!visible || dates.length <= 1) return null

  const selected = new Set(selectedDates)

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">Dies a generar</div>
          <div className="text-xs text-slate-500">
            Tria si vols aplicar el quadrant a tots els dies o només a alguns.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedDates(dates)}
          >
            Tots
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSelectedDates([])}
          >
            Cap
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {dates.map((date) => {
          const active = selected.has(date)
          return (
            <button
              key={date}
              type="button"
              onClick={() =>
                setSelectedDates(
                  active
                    ? selectedDates.filter((value) => value !== date)
                    : [...selectedDates, date].sort((a, b) => a.localeCompare(b))
                )
              }
              className={
                active
                  ? 'rounded-full border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50'
              }
              aria-pressed={active}
            >
              {formatDay(date)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

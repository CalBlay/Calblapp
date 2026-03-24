// file: src/components/reports/filters/FiltersBar.tsx
'use client'

import { useRef, useState } from 'react'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'

export type Filters = {
  start: string
  end: string
  department: string
  event: string
  person: string
  line: string
}

type Props = {
  value: Filters
  onChange: (next: Filters) => void
  departmentOptions?: string[]
  eventOptions?: Array<{ id: string; name: string }>
  personOptions?: string[]
  lineOptions?: string[]
  collapsible?: boolean
}

export function FiltersBar({
  value,
  onChange,
  departmentOptions = [],
  eventOptions = [],
  personOptions = [],
  lineOptions = [],
  collapsible = false,
}: Props) {
  // Fixar els valors inicials per no provocar loops amb SmartFilters
  const initialStartRef = useRef(value.start)
  const initialEndRef = useRef(value.end)
  const lastDateRef = useRef<{ start: string; end: string }>({
    start: value.start,
    end: value.end,
  })
  const [open, setOpen] = useState(!collapsible)

  const update = (partial: Partial<Filters>) => {
    const next = { ...value, ...partial }
    const changed = (Object.keys(next) as Array<keyof Filters>).some(
      (key) => next[key] !== value[key]
    )
    if (changed) onChange(next)
  }

  const handleDates = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    if (f.start === lastDateRef.current.start && f.end === lastDateRef.current.end) return
    lastDateRef.current = { start: f.start, end: f.end }
    onChange({ ...value, start: f.start, end: f.end })
  }

  const panelClass = collapsible
    ? `${open ? 'block' : 'hidden'} sm:block`
    : 'block'

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <SmartFilters
            role="Admin"
            onChange={handleDates}
            showDepartment={false}
            showCommercial={false}
            showWorker={false}
            showLocation={false}
            showStatus={false}
            showImportance={false}
            showAdvanced={false}
            compact
            initialStart={initialStartRef.current}
            initialEnd={initialEndRef.current}
          />
        </div>

        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="sm:hidden h-10 w-10 flex items-center justify-center rounded-xl border border-gray-300 bg-white hover:bg-gray-100 shrink-0"
            title={open ? 'Amaga filtres' : 'Mostra filtres'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 12h12M10 20h4" />
            </svg>
          </button>
        )}
      </div>

      <div className={panelClass}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 md:mt-4">
          <div>
            <label className="text-xs font-semibold text-gray-500">Departament</label>
            <select
              className="mt-1 w-full rounded-md border p-2 text-sm bg-white"
              value={value.department}
              onChange={e => update({ department: e.target.value })}
            >
              <option value="">Tots</option>
              {departmentOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">Esdeveniment (codi/nom)</label>
            <select
              className="mt-1 w-full rounded-md border p-2 text-sm bg-white"
              value={value.event}
              onChange={e => update({ event: e.target.value })}
            >
              <option value="">Tots</option>
              {eventOptions.map(opt => {
                const label =
                  opt.name && opt.name !== opt.id ? `${opt.id} - ${opt.name}` : opt.id || opt.name || '(sense nom)'
                return (
                  <option key={opt.id} value={opt.id}>
                    {label}
                  </option>
                )
              })}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">Persona</label>
            <select
              className="mt-1 w-full rounded-md border p-2 text-sm bg-white"
              value={value.person}
              onChange={e => update({ person: e.target.value })}
            >
              <option value="">Totes</option>
              {personOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500">Línia de negoci</label>
            <select
              className="mt-1 w-full rounded-md border p-2 text-sm bg-white"
              value={value.line}
              onChange={e => update({ line: e.target.value })}
            >
              <option value="">Totes</option>
              {lineOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

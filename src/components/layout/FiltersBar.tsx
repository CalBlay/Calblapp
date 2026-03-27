'use client'

import React, { useState, useCallback, memo } from 'react'
import { usePathname } from 'next/navigation'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import FilterButton from '@/components/ui/filter-button'

export type FiltersState = {
  start: string
  end: string
  mode?: 'week' | 'day' | 'range'
  dateMode?: 'all' | 'planned' | 'created' | 'updated' | 'completed'
  ln?: string
  responsable?: string
  location?: string
  status?: string
  priority?: string
}

type FilterKey = 'ln' | 'responsable' | 'location'

export type FiltersBarProps = {
  id?: string
  filters: FiltersState
  setFilters: (f: Partial<FiltersState>) => void
  onReset?: () => void
  visibleFilters?: FilterKey[]
  hiddenFilters?: FilterKey[]
  lnOptions?: string[]
  responsables?: string[]
  locations?: string[]
  collapseOnMobile?: boolean
  statusOptions?: { value: string; label: string }[]
  statusLabel?: string
  priorityOptions?: { value: string; label: string }[]
  priorityLabel?: string
}

export default function FiltersBar({
  filters,
  setFilters,
  onReset,
  visibleFilters = [],
  hiddenFilters = ['ln', 'responsable', 'location'],
  lnOptions = [],
  responsables = [],
  locations = [],
  collapseOnMobile = false,
  statusOptions = [],
  statusLabel = 'Estat',
  priorityOptions = [],
  priorityLabel = 'Prioritat',
}: FiltersBarProps) {
  const pathname = usePathname()
  const isQuadrants = pathname?.startsWith('/menu/quadrants')
  const { setOpen, setContent } = useFilters()

  const [resetSignal, setResetSignal] = useState(0)

  const handleDatesChange = useCallback(
    (f: SmartFiltersChange) => {
      if (f.start) {
        const base = new Date(f.start)
        const weekStart = startOfWeek(base, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(base, { weekStartsOn: 1 })
        setFilters({
          start: format(weekStart, 'yyyy-MM-dd'),
          end: format(weekEnd, 'yyyy-MM-dd'),
          mode: 'week',
        })
      }
    },
    [setFilters]
  )

  const SelectsInline = memo(() => {
    const base = 'h-10 rounded-xl border bg-white text-gray-900 px-3'
    return (
      <>
        {visibleFilters.includes('ln') && (
          <select
            className={`${base} w-[150px]`}
            value={filters.ln ?? '__all__'}
            onChange={(e) => setFilters({ ln: e.target.value })}
          >
            <option value="__all__">LN: Totes</option>
            {lnOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}

        {visibleFilters.includes('responsable') && (
          <select
            className={`${base} w-[180px]`}
            value={filters.responsable ?? '__all__'}
            onChange={(e) => setFilters({ responsable: e.target.value })}
          >
            <option value="__all__">Resp: Tots</option>
            {responsables.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}

        {visibleFilters.includes('location') && (
          <select
            className={`${base} w-[170px]`}
            value={filters.location ?? '__all__'}
            onChange={(e) => setFilters({ location: e.target.value })}
          >
            <option value="__all__">Ubicació: Totes</option>
            {locations.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </>
    )
  })

  return (
    <div className="sticky top-[56px] z-40 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div
        className={`mx-auto flex w-full items-center justify-between gap-2 overflow-x-auto whitespace-nowrap px-2 py-[3px] sm:flex-nowrap ${
          isQuadrants ? 'max-w-none' : 'max-w-5xl'
        }`}
      >
        <SmartFilters
          modeDefault="week"
          role="Treballador"
          showDepartment={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          onChange={handleDatesChange}
          resetSignal={resetSignal}
          initialStart={filters.start}
          initialEnd={filters.end}
        />

        {/* Selects inline opcionals (actualment no utilitzats) */}
        <SelectsInline />

        <FilterButton
          onClick={() => {
            setContent(
              <div className="p-4 flex flex-col gap-4">
                {lnOptions?.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-gray-600">Línia de Negoci</label>
                    <select
                      className="h-10 rounded-xl border bg-white px-3"
                      value={filters.ln ?? '__all__'}
                      onChange={(e) => setFilters({ ln: e.target.value })}
                    >
                      <option value="__all__">Totes</option>
                      {lnOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(isQuadrants || statusOptions.length > 0) && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-gray-600">{statusLabel}</label>
                    <select
                      className="h-10 rounded-xl border bg-white px-3"
                      value={filters.status ?? '__all__'}
                      onChange={(e) => setFilters({ status: e.target.value })}
                    >
                      {isQuadrants ? (
                        <>
                          <option value="__all__">Tots</option>
                          <option value="pending">Pendents</option>
                          <option value="draft">Esborranys</option>
                          <option value="confirmed">Confirmats</option>
                        </>
                      ) : (
                        statusOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}

                {priorityOptions.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-gray-600">{priorityLabel}</label>
                    <select
                      className="h-10 rounded-xl border bg-white px-3"
                      value={filters.priority ?? '__all__'}
                      onChange={(e) => setFilters({ priority: e.target.value })}
                    >
                      {priorityOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {responsables && responsables.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-gray-600">Responsable</label>
                    <select
                      className="h-10 rounded-xl border bg-white px-3"
                      value={filters.responsable ?? '__all__'}
                      onChange={(e) => setFilters({ responsable: e.target.value })}
                    >
                      <option value="__all__">Tots</option>
                      {responsables.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {locations && locations.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-gray-600">Ubicació</label>
                    <select
                      className="h-10 rounded-xl border bg-white px-3"
                      value={filters.location ?? '__all__'}
                      onChange={(e) => setFilters({ location: e.target.value })}
                    >
                      <option value="__all__">Totes</option>
                      {locations.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <ResetFilterButton
                  onClick={() => {
                    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
                    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
                    setFilters({
                      start: format(s, 'yyyy-MM-dd'),
                      end: format(e, 'yyyy-MM-dd'),
                      mode: 'week',
                      ln: undefined,
                      responsable: undefined,
                      location: undefined,
                      status: undefined,
                      priority: undefined,
                    })
                    setResetSignal((r) => r + 1)
                    onReset?.()
                    setOpen(false)
                  }}
                />
              </div>
            )
            setOpen(true)
          }}
        />
      </div>
    </div>
  )
}

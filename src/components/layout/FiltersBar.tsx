'use client'

import React, { useState, useCallback, memo } from 'react'
import { usePathname } from 'next/navigation'
import SmartFilters, { SmartFiltersChange } from '@/components/filters/SmartFilters'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { useFilters } from '@/context/FiltersContext'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import FilterButton from '@/components/ui/filter-button'
import {
  CorporateFilterField,
  CorporateFilterSelect,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import { cn } from '@/lib/utils'

export type FiltersState = {
  start: string
  end: string
  mode?: 'week' | 'month' | 'day' | 'range'
  dateMode?: 'all' | 'planned' | 'created' | 'updated' | 'completed'
  ln?: string
  responsable?: string
  commercial?: string
  location?: string
  status?: string
  priority?: string
  ticketBucket?: string
  ticketScope?: string
}

type FilterKey = 'ln' | 'responsable' | 'commercial' | 'location'

export type FiltersBarProps = {
  id?: string
  filters: FiltersState
  setFilters: (f: Partial<FiltersState>) => void
  onReset?: () => void
  visibleFilters?: FilterKey[]
  hiddenFilters?: FilterKey[]
  lnOptions?: string[]
  responsables?: string[]
  commercials?: string[]
  locations?: string[]
  collapseOnMobile?: boolean
  statusOptions?: { value: string; label: string }[]
  statusLabel?: string
  priorityOptions?: { value: string; label: string }[]
  priorityLabel?: string
  showResponsableFilter?: boolean
  modeDefault?: 'week' | 'month' | 'day' | 'range'
  modeOptions?: Array<'week' | 'month' | 'day' | 'range'>
}

export default function FiltersBar({
  filters,
  setFilters,
  onReset,
  visibleFilters = [],
  hiddenFilters = ['ln', 'responsable', 'location'],
  lnOptions = [],
  responsables = [],
  commercials = [],
  locations = [],
  collapseOnMobile = false,
  statusOptions = [],
  statusLabel = 'Estat',
  priorityOptions = [],
  priorityLabel = 'Prioritat',
  showResponsableFilter = false,
  modeDefault = 'week',
  modeOptions = ['week', 'day', 'range'],
}: FiltersBarProps) {
  void hiddenFilters
  void collapseOnMobile
  const pathname = usePathname()
  const isQuadrants = pathname?.startsWith('/menu/quadrants')
  const isAssignments = pathname?.startsWith('/menu/logistica/assignacions')
  const isWideLayout = isQuadrants || isAssignments
  const { setOpen, setContent } = useFilters()

  const [resetSignal, setResetSignal] = useState(0)

  const applyFiltersAndClose = useCallback(
    (next: Partial<FiltersState>) => {
      setFilters(next)
      setOpen(false)
    },
    [setFilters, setOpen]
  )

  const handleDatesChange = useCallback(
    (f: SmartFiltersChange) => {
      if (f.start && f.end) {
        if (f.mode === 'month') {
          setFilters({
            start: f.start,
            end: f.end,
            mode: 'month',
          })
          return
        }

        if (f.mode === 'day') {
          setFilters({
            start: f.start,
            end: f.end,
            mode: 'day',
          })
          return
        }

        if (f.mode === 'range') {
          setFilters({
            start: f.start,
            end: f.end,
            mode: 'range',
          })
          return
        }

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

  const SelectsInline = memo(function SelectsInline() {
    return (
      <>
        {visibleFilters.includes('ln') && (
          <CorporateFilterField label="Línia de negoci" className="shrink-0">
            <CorporateFilterSelect
              minWidthClassName="min-w-[150px]"
              value={filters.ln ?? '__all__'}
              onChange={(e) => setFilters({ ln: e.target.value })}
            >
              <option value="__all__">Totes</option>
              {lnOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>
        )}

        {visibleFilters.includes('responsable') && (
          <CorporateFilterField label="Responsable" className="shrink-0">
            <CorporateFilterSelect
              minWidthClassName="min-w-[180px]"
              value={filters.responsable ?? '__all__'}
              onChange={(e) => setFilters({ responsable: e.target.value })}
            >
              <option value="__all__">Tots</option>
              {responsables.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>
        )}

        {visibleFilters.includes('commercial') && (
          <CorporateFilterField label="Comercial" className="shrink-0">
            <CorporateFilterSelect
              minWidthClassName="min-w-[180px]"
              value={filters.commercial ?? '__all__'}
              onChange={(e) => setFilters({ commercial: e.target.value })}
            >
              <option value="__all__">Tots</option>
              {commercials.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>
        )}

        {visibleFilters.includes('location') && (
          <CorporateFilterField label="Ubicació" className="shrink-0">
            <CorporateFilterSelect
              minWidthClassName="min-w-[170px]"
              value={filters.location ?? '__all__'}
              onChange={(e) => setFilters({ location: e.target.value })}
            >
              <option value="__all__">Totes</option>
              {locations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </CorporateFilterSelect>
          </CorporateFilterField>
        )}
      </>
    )
  })

  return (
    <CorporateFiltersShell
      variant="toolbar"
      sticky
      className={cn('w-full', isWideLayout ? 'max-w-none' : 'mx-auto max-w-5xl')}
      bodyClassName="items-center overflow-x-auto"
    >
      <SmartFilters
        modeDefault={modeDefault}
        modeOptions={modeOptions}
        role="Treballador"
        showDepartment={false}
        showWorker={false}
        showLocation={false}
        showStatus={false}
        onChange={handleDatesChange}
        resetSignal={resetSignal}
        initialStart={filters.start}
        initialEnd={filters.end}
        compact
      />

      <SelectsInline />

      <div className="min-w-[8px] flex-1" />

      <FilterButton
        onClick={() => {
          setContent(
            <div className="flex flex-col gap-4 p-4">
              {lnOptions?.length > 0 && (
                <CorporateFilterField label="Línia de negoci">
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.ln ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ ln: e.target.value })}
                  >
                    <option value="__all__">Totes</option>
                    {lnOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CorporateFilterSelect>
                </CorporateFilterField>
              )}

              {(isQuadrants || statusOptions.length > 0) && (
                <CorporateFilterField label={statusLabel}>
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.status ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ status: e.target.value })}
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
                  </CorporateFilterSelect>
                </CorporateFilterField>
              )}

              {priorityOptions.length > 0 && (
                <CorporateFilterField label={priorityLabel}>
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.priority ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ priority: e.target.value })}
                  >
                    {priorityOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </CorporateFilterSelect>
                </CorporateFilterField>
              )}

              {(showResponsableFilter || (responsables && responsables.length > 0)) && (
                <CorporateFilterField label="Responsable">
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.responsable ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ responsable: e.target.value })}
                  >
                    <option value="__all__">Tots</option>
                    {responsables.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CorporateFilterSelect>
                </CorporateFilterField>
              )}

              {commercials && commercials.length > 0 && (
                <CorporateFilterField label="Comercial">
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.commercial ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ commercial: e.target.value })}
                  >
                    <option value="__all__">Tots</option>
                    {commercials.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CorporateFilterSelect>
                </CorporateFilterField>
              )}

              {locations && locations.length > 0 && (
                <CorporateFilterField label="Ubicació">
                  <CorporateFilterSelect
                    className="w-full"
                    minWidthClassName="min-w-0"
                    value={filters.location ?? '__all__'}
                    onChange={(e) => applyFiltersAndClose({ location: e.target.value })}
                  >
                    <option value="__all__">Totes</option>
                    {locations.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </CorporateFilterSelect>
                </CorporateFilterField>
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
                    commercial: undefined,
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
    </CorporateFiltersShell>
  )
}

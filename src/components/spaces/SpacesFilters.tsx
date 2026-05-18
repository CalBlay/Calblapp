'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ResetFilterButton from '@/components/ui/ResetFilterButton'

export type SpacesStageFilter = 'confirmat' | 'pressupost' | 'calentet'

export interface SpacesFilterState {
  stage?: SpacesStageFilter[]
  finca?: string[]
  comercial?: string[]
  ln?: string[]
}

interface SpacesFiltersProps {
  value?: SpacesFilterState
  fincas?: string[]
  comercials?: string[]
  lns?: string[]
  onChange: (patch: SpacesFilterState) => void
}

function getDefaultLnSelection(lns: string[]): string[] {
  return lns.filter((ln) => !ln.toLowerCase().includes('restaurant'))
}

export default function SpacesFilters({
  value,
  fincas = [],
  comercials = [],
  lns = [],
  onChange,
}: SpacesFiltersProps) {
  const [filters, setFilters] = useState<SpacesFilterState>(() => ({
    stage: value?.stage ?? [],
    finca: value?.finca ?? [],
    comercial: value?.comercial ?? [],
    ln: value?.ln ?? [],
  }))

  useEffect(() => {
    setFilters({
      stage: value?.stage ?? [],
      finca: value?.finca ?? [],
      comercial: value?.comercial ?? [],
      ln: value?.ln ?? [],
    })
  }, [value])

  useEffect(() => {
    onChange(filters)
  }, [filters, onChange])

  const resetAll = () => {
    setFilters({
      stage: [],
      finca: [],
      comercial: [],
      ln: getDefaultLnSelection(lns),
    })
  }

  const toggleValue = (key: keyof SpacesFilterState, nextValue: string) => {
    setFilters((prev) => {
      const currentValues = Array.isArray(prev[key]) ? prev[key] : []
      const exists = currentValues.includes(nextValue as never)

      return {
        ...prev,
        [key]: exists
          ? currentValues.filter((value) => value !== nextValue)
          : [...currentValues, nextValue],
      }
    })
  }

  const clearGroup = (key: keyof SpacesFilterState) => {
    setFilters((prev) => ({
      ...prev,
      [key]: [],
    }))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 w-full border-b pb-3 px-2"
    >
      <FilterGroup
        label="Estat"
        allLabel="Tots els estats"
        values={filters.stage ?? []}
        options={[
          { value: 'confirmat', label: 'Confirmats' },
          { value: 'pressupost', label: 'Pressupost enviat' },
          { value: 'calentet', label: 'Prereserva / Calentet' },
        ]}
        onClear={() => clearGroup('stage')}
        onToggle={(nextValue) => toggleValue('stage', nextValue)}
      />

      <FilterGroup
        label="Linies de negoci"
        allLabel="Totes les linies de negoci"
        values={filters.ln ?? []}
        options={lns.map((ln) => ({ value: ln, label: ln }))}
        onClear={() => clearGroup('ln')}
        onToggle={(nextValue) => toggleValue('ln', nextValue)}
      />

      <FilterGroup
        label="Finca"
        allLabel="Totes les finques"
        values={filters.finca ?? []}
        options={fincas.map((finca) => ({ value: finca, label: finca }))}
        onClear={() => clearGroup('finca')}
        onToggle={(nextValue) => toggleValue('finca', nextValue)}
      />

      <FilterGroup
        label="Comercial"
        allLabel="Tots els comercials"
        values={filters.comercial ?? []}
        options={comercials.map((comercial) => ({ value: comercial, label: comercial }))}
        onClear={() => clearGroup('comercial')}
        onToggle={(nextValue) => toggleValue('comercial', nextValue)}
      />

      <div className="flex justify-end mt-2">
        <ResetFilterButton onClick={resetAll} />
      </div>
    </motion.div>
  )
}

type FilterGroupProps = {
  label: string
  allLabel: string
  values: string[]
  options: Array<{ value: string; label: string }>
  onClear: () => void
  onToggle: (value: string) => void
}

function FilterGroup({
  label,
  allLabel,
  values,
  options,
  onClear,
  onToggle,
}: FilterGroupProps) {
  return (
    <div>
      <label className="text-[11px] text-gray-500">{label}</label>
      <div className="mt-1 rounded-md border bg-white p-2 space-y-2 max-h-40 overflow-y-auto">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.length === 0}
            onChange={onClear}
          />
          {allLabel}
        </label>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}

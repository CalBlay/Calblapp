'use client'

import { useEffect, useState } from 'react'
import { MotionDiv } from '@/lib/lazyMotion'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { isGrupsRestaurantsLn } from '@/lib/spacesLn'
import { corporateFilterLabelClass } from '@/lib/corporate-filters'

export type SpacesStageFilter = 'confirmat' | 'pressupost' | 'calentet'

export interface SpacesFilterState {
  stage?: SpacesStageFilter[]
  finca?: string[]
  comercial?: string[]
  ln?: string[]
  /** Per defecte: amaga Grups Restaurants sense llista blanca de LN. */
  excludeGrupsRestaurants?: boolean
}

interface SpacesFiltersProps {
  value?: SpacesFilterState
  fincas?: string[]
  comercials?: string[]
  lns?: string[]
  onChange: (patch: SpacesFilterState) => void
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
    excludeGrupsRestaurants: value?.excludeGrupsRestaurants ?? false,
  }))

  useEffect(() => {
    setFilters({
      stage: value?.stage ?? [],
      finca: value?.finca ?? [],
      comercial: value?.comercial ?? [],
      ln: value?.ln ?? [],
      excludeGrupsRestaurants: value?.excludeGrupsRestaurants ?? false,
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
      ln: [],
      excludeGrupsRestaurants: true,
    })
  }

  const toggleLn = (nextValue: string) => {
    setFilters((prev) => {
      const currentValues = prev.ln ?? []
      const inExcludeDefault =
        prev.excludeGrupsRestaurants === true && currentValues.length === 0

      if (inExcludeDefault) {
        if (isGrupsRestaurantsLn(nextValue)) {
          return {
            ...prev,
            excludeGrupsRestaurants: false,
            ln: [],
          }
        }
        return {
          ...prev,
          excludeGrupsRestaurants: false,
          ln: lns.filter(
            (ln) => ln !== nextValue && !isGrupsRestaurantsLn(ln)
          ),
        }
      }

      const exists = currentValues.includes(nextValue)
      return {
        ...prev,
        excludeGrupsRestaurants: false,
        ln: exists
          ? currentValues.filter((value) => value !== nextValue)
          : [...currentValues, nextValue],
      }
    })
  }

  const toggleValue = (key: keyof SpacesFilterState, nextValue: string) => {
    if (key === 'ln') {
      toggleLn(nextValue)
      return
    }

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
      excludeGrupsRestaurants: key === 'ln' ? false : prev.excludeGrupsRestaurants,
      [key]: [],
    }))
  }

  const lnValues = filters.ln ?? []
  const lnExcludeDefault = filters.excludeGrupsRestaurants === true && lnValues.length === 0
  const isLnChecked = (optionValue: string) => {
    if (lnValues.includes(optionValue)) return true
    if (lnExcludeDefault && !isGrupsRestaurantsLn(optionValue)) return true
    return false
  }

  return (
    <MotionDiv
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
        allChecked={lnValues.length === 0 && !lnExcludeDefault}
        isOptionChecked={isLnChecked}
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
    </MotionDiv>
  )
}

type FilterGroupProps = {
  label: string
  allLabel: string
  values: string[]
  allChecked?: boolean
  isOptionChecked?: (value: string) => boolean
  options: Array<{ value: string; label: string }>
  onClear: () => void
  onToggle: (value: string) => void
}

function FilterGroup({
  label,
  allLabel,
  values,
  allChecked,
  isOptionChecked,
  options,
  onClear,
  onToggle,
}: FilterGroupProps) {
  const showAll = allChecked ?? values.length === 0
  const optionChecked = isOptionChecked ?? ((value: string) => values.includes(value))

  return (
    <div>
      <label className={corporateFilterLabelClass}>{label}</label>
      <div className="mt-1 rounded-md border bg-white p-2 space-y-2 max-h-40 overflow-y-auto">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showAll}
            onChange={onClear}
          />
          {allLabel}
        </label>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={optionChecked(option.value)}
              onChange={() => onToggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  )
}

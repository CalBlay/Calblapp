'use client'

import React from 'react'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import type { TransportType, TransportTypeDefinition } from '@/lib/transportTypes'

export type TransportFiltersState = {
  type: 'all' | TransportType
  availability: 'all' | 'available' | 'unavailable'
  driver: 'all' | 'assigned' | 'unassigned'
}

interface Props {
  filters: TransportFiltersState
  setFilters: (f: TransportFiltersState) => void
  transportTypes: TransportTypeDefinition[]
}

export default function TransportFilters({ filters, setFilters, transportTypes }: Props) {
  const handleChange = <K extends keyof TransportFiltersState>(
    key: K,
    value: TransportFiltersState[K]
  ) => {
    setFilters({ ...filters, [key]: value })
  }

  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="space-y-1">
        <div className="font-medium text-gray-700">Tipus de vehicle</div>
        <select
          value={filters.type}
          onChange={(e) =>
            handleChange('type', e.target.value as TransportFiltersState['type'])
          }
          className="w-full border rounded-md px-2 py-1 bg-white"
        >
          <option value="all">Tots</option>
          {transportTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <div className="font-medium text-gray-700">Disponibilitat</div>
        <select
          value={filters.availability}
          onChange={(e) =>
            handleChange(
              'availability',
              e.target.value as TransportFiltersState['availability']
            )
          }
          className="w-full border rounded-md px-2 py-1 bg-white"
        >
          <option value="all">Tots</option>
          <option value="available">Nomes disponibles</option>
          <option value="unavailable">Nomes no disponibles</option>
        </select>
      </div>

      <div className="space-y-1">
        <div className="font-medium text-gray-700">Conductor</div>
        <select
          value={filters.driver}
          onChange={(e) =>
            handleChange(
              'driver',
              e.target.value as TransportFiltersState['driver']
            )
          }
          className="w-full border rounded-md px-2 py-1 bg-white"
        >
          <option value="all">Tots</option>
          <option value="assigned">Amb conductor assignat</option>
          <option value="unassigned">Sense conductor</option>
        </select>
      </div>

      <div className="flex justify-end pt-2">
        <ResetFilterButton
          onClick={() =>
            setFilters({
              type: 'all',
              availability: 'all',
              driver: 'all',
            })
          }
        />
      </div>
    </div>
  )
}

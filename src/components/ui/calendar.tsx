// file: src/components/ui/calendar.tsx
'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'

interface CalendarProps {
  mode?: 'single' | 'range'
  selected?: any
  onSelect?: (value: any) => void
}

export function Calendar({ mode = 'single', selected, onSelect }: CalendarProps) {
  const sharedProps = {
    locale: es,
    showOutsideDays: true,
    numberOfMonths: 1,
    defaultMonth: selected?.from || new Date(),
    weekStartsOn: 1 as const,
    styles: {
      caption: { textTransform: 'capitalize' as const },
      head_cell: { textTransform: 'capitalize' as const, color: '#666' },
    },
    modifiersClassNames: {
      selected: 'bg-blue-600 text-white rounded-full',
      range_start: 'bg-blue-500 text-white rounded-full',
      range_end: 'bg-blue-500 text-white rounded-full',
      range_middle: 'bg-blue-100 text-blue-700',
    },
  }

  return (
    <div className="p-2 bg-white rounded-xl shadow-md">
      {mode === 'range' ? (
        <DayPicker
          {...sharedProps}
          mode="range"
          required={false}
          selected={selected}
          onSelect={onSelect}
        />
      ) : (
        <DayPicker
          {...sharedProps}
          mode="single"
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

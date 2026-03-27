// file: src/components/ui/calendar.tsx
'use client'

import * as React from 'react'
import type { DateRange, SelectSingleEventHandler, SelectRangeEventHandler } from 'react-day-picker'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { es } from 'date-fns/locale'

interface CalendarProps {
  mode?: 'single' | 'range'
  selected?: Date | DateRange | undefined
  onSelect?: SelectSingleEventHandler | SelectRangeEventHandler
}

export function Calendar({ mode = 'single', selected, onSelect }: CalendarProps) {
  const sharedProps = {
    locale: es,
    showOutsideDays: true,
    numberOfMonths: 1,
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

  const selectedRange = mode === 'range' ? (selected as DateRange | undefined) : undefined
  const selectedDate = mode === 'single' ? (selected as Date | undefined) : undefined
  const defaultMonth = mode === 'range' ? selectedRange?.from || new Date() : selectedDate || new Date()

  return (
    <div className="p-2 bg-white rounded-xl shadow-md">
      {mode === 'range' ? (
        <DayPicker
          {...sharedProps}
          mode="range"
          required={false}
          defaultMonth={defaultMonth}
          selected={selectedRange}
          onSelect={onSelect as SelectRangeEventHandler | undefined}
        />
      ) : (
        <DayPicker
          {...sharedProps}
          mode="single"
          defaultMonth={defaultMonth}
          selected={selectedDate}
          onSelect={onSelect as SelectSingleEventHandler | undefined}
        />
      )}
    </div>
  )
}

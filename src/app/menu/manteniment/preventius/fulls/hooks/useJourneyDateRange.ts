'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from 'date-fns'
import type { JourneyDateFilters, JourneyDateMode } from '../lib/types'

export function useJourneyDateRange(queryStart: string, queryEnd: string) {
  const [filters, setFiltersState] = useState<JourneyDateFilters>(() => {
    const value = format(new Date(), 'yyyy-MM-dd')
    return { start: value, end: value, mode: 'day' }
  })

  useEffect(() => {
    if (!queryStart && !queryEnd) return
    setFiltersState((prev) => {
      const nextStart = queryStart || prev.start
      const nextEnd = queryEnd || prev.end
      const parsedStart = parseISO(nextStart)
      const isMonthRange =
        nextStart === format(startOfMonth(parsedStart), 'yyyy-MM-dd') &&
        nextEnd === format(endOfMonth(parsedStart), 'yyyy-MM-dd')
      const isWeekRange =
        nextStart === format(startOfWeek(parsedStart, { weekStartsOn: 1 }), 'yyyy-MM-dd') &&
        nextEnd === format(endOfWeek(parsedStart, { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const nextMode: JourneyDateMode =
        nextStart === nextEnd ? 'day' : isMonthRange ? 'month' : isWeekRange ? 'week' : 'week'
      if (prev.start === nextStart && prev.end === nextEnd && prev.mode === nextMode) return prev
      return { ...prev, start: nextStart, end: nextEnd, mode: nextMode }
    })
  }, [queryEnd, queryStart])

  const currentStart = useMemo(() => parseISO(filters.start), [filters.start])
  const currentEnd = useMemo(() => parseISO(filters.end), [filters.end])

  const setMode = (nextMode: JourneyDateMode) => {
    if (nextMode === 'day') {
      const value = format(currentStart, 'yyyy-MM-dd')
      setFiltersState({ start: value, end: value, mode: 'day' })
      return
    }
    if (nextMode === 'month') {
      const monthStart = startOfMonth(currentStart)
      const monthEnd = endOfMonth(currentStart)
      setFiltersState({
        start: format(monthStart, 'yyyy-MM-dd'),
        end: format(monthEnd, 'yyyy-MM-dd'),
        mode: 'month',
      })
      return
    }
    const weekStart = startOfWeek(currentStart, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(currentStart, { weekStartsOn: 1 })
    setFiltersState({
      start: format(weekStart, 'yyyy-MM-dd'),
      end: format(weekEnd, 'yyyy-MM-dd'),
      mode: 'week',
    })
  }

  const shiftRange = (direction: 'prev' | 'next') => {
    if (filters.mode === 'day') {
      const next = direction === 'next' ? addDays(currentStart, 1) : subDays(currentStart, 1)
      const value = format(next, 'yyyy-MM-dd')
      setFiltersState({ start: value, end: value, mode: 'day' })
      return
    }
    if (filters.mode === 'month') {
      const next = direction === 'next' ? addMonths(currentStart, 1) : subMonths(currentStart, 1)
      const monthStart = startOfMonth(next)
      const monthEnd = endOfMonth(next)
      setFiltersState({
        start: format(monthStart, 'yyyy-MM-dd'),
        end: format(monthEnd, 'yyyy-MM-dd'),
        mode: 'month',
      })
      return
    }
    const next = direction === 'next' ? addWeeks(currentStart, 1) : subWeeks(currentStart, 1)
    const weekStart = startOfWeek(next, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(next, { weekStartsOn: 1 })
    setFiltersState({
      start: format(weekStart, 'yyyy-MM-dd'),
      end: format(weekEnd, 'yyyy-MM-dd'),
      mode: 'week',
    })
  }

  const rangeLabel =
    filters.mode === 'day'
      ? format(currentStart, 'dd MMM yyyy')
      : filters.mode === 'month'
        ? format(currentStart, 'MMMM yyyy')
        : `${format(currentStart, 'd MMM')} - ${format(currentEnd, 'd MMM')}`

  return { filters, setMode, shiftRange, rangeLabel }
}

'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'

export type QuadrantEvent = {
  id: string
  code?: string
  eventName?: string
  location?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  pax?: number
  ln?: string
  commercial?: string
  status?: 'pending' | 'draft' | 'confirmed'
  department?: string
  responsableName?: string
  totalWorkers?: number
  numDrivers?: number
  [key: string]: unknown
}

const fetcher = async (url: string): Promise<QuadrantEvent[]> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return (json?.quadrants || json?.events || []) as QuadrantEvent[]
}

const EMPTY: QuadrantEvent[] = []

export function useQuadrants(department: string, start?: string, end?: string) {
  const url = useMemo(() => {
    if (!department || !start || !end) return null
    const params = new URLSearchParams({ department, start, end })
    return `/api/quadrants/get?${params.toString()}`
  }, [department, start, end])

  const { data, error, isLoading, mutate } = useSWR<QuadrantEvent[]>(url, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const reload = useCallback(() => {
    void mutate()
  }, [mutate])

  return {
    quadrants: data ?? EMPTY,
    loading: isLoading,
    error: error ?? null,
    reload,
  }
}

export default useQuadrants

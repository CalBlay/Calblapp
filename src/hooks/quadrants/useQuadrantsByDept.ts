//file: src/hooks/quadrants/useQuadrantsByDept.ts
'use client'

import { useMemo } from 'react'
import useSWR from 'swr'

/**
 * 🧩 Tipus coherent amb el que torna Firestore
 */
export interface QuadrantData {
  id: string
  code?: string
  department: string
  eventName: string
  service?: string        // Servei
  location?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  responsable?: string
  conductors?: { name: string; plate?: string; vehicleType?: string }[]
  treballadors?: { name: string; role?: string }[]
  pax?: number
  dressCode?: string
  status?: string
  displayDate?: string
}

type RawQuadrant = Omit<QuadrantData, 'service' | 'code' | 'displayDate'> & {
  code?: string
  eventCode?: string
  service?: string
  servei?: string
}

const formatQuadrant = (q: RawQuadrant): QuadrantData => {
  const d = q.startDate ? new Date(q.startDate) : null
  const dayName = d ? d.toLocaleDateString('ca-ES', { weekday: 'long' }) : ''
  const dayNum = d
    ? d.toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit' })
    : ''
  return {
    ...q,
    code: q.code || q.eventCode || q.id,
    service: q.service || q.servei || undefined,
    displayDate: d
      ? `${dayNum} — ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}`
      : '',
  }
}

const quadrantsFetcher = async (url: string): Promise<QuadrantData[]> => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`)
  }
  return ((json.quadrants || []) as RawQuadrant[]).map(formatQuadrant)
}

/**
 * 🔹 Carrega quadrants d'una setmana segons departament
 */
export default function useQuadrantsByDept(
  departament: string,
  startDate: string,
  endDate: string
) {
  const ready = Boolean(departament && startDate && endDate)
  const url = useMemo(() => {
    if (!ready) return null
    const params = new URLSearchParams({
      department: departament,
      start: startDate,
      end: endDate,
    })
    return `/api/quadrants/get?${params.toString()}`
  }, [ready, departament, startDate, endDate])

  const { data, error, isLoading } = useSWR<QuadrantData[]>(url, quadrantsFetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  })

  const quadrants = useMemo(() => data ?? [], [data])

  const groupedByDay = useMemo(() => {
    const groups: Record<string, QuadrantData[]> = {}
    quadrants.forEach((q) => {
      const key = q.displayDate || 'Sense data'
      if (!groups[key]) groups[key] = []
      groups[key].push(q)
    })
    return groups
  }, [quadrants])

  return {
    quadrants,
    groupedByDay,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

// file: src/hooks/useEventPersonnel.ts
'use client'

import { useMemo } from 'react'
import useSWR from 'swr'

export interface Person {
  id?: string
  name?: string
  role?: string
  phone?: string
  department?: string
  meetingPoint?: string
  time?: string
  plate?: string
  endTime?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  leftEarly?: boolean
}

export interface EventPersonnel {
  responsables?: Person[]
  conductors?: Person[]
  treballadors?: Person[]
}

const fetcher = async (url: string): Promise<EventPersonnel> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
  return (await res.json()) as EventPersonnel
}

export function useEventPersonnel(eventId?: string | number) {
  const url = useMemo(() => {
    if (!eventId) return null
    return `/api/events/personnel?eventId=${encodeURIComponent(String(eventId))}`
  }, [eventId])

  const { data, error, isLoading } = useSWR<EventPersonnel>(url, fetcher, {
    /**
     * Personal d'un esdeveniment canvia poc; deduplicacio agressiva
     * entre components de la mateixa pagina i revalidacio en focus
     * per detectar canvis sense forçar refetch constants.
     */
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  return {
    data: data ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

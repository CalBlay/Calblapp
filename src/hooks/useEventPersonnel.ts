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
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Error HTTP ${res.status}`)
  }
  return (await res.json()) as EventPersonnel
}

export function canonicalEventId(value?: string | number | null) {
  return String(value || '')
    .trim()
    .split('__')[0]
    .trim()
}

export function useEventPersonnel(eventId?: string | number) {
  const canonicalId = useMemo(() => canonicalEventId(eventId), [eventId])

  const url = useMemo(() => {
    if (!canonicalId) return null
    return `/api/events/personnel?eventId=${encodeURIComponent(canonicalId)}`
  }, [canonicalId])

  const { data, error, isLoading, isValidating, mutate } = useSWR<EventPersonnel>(url, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5_000,
  })

  const loading = Boolean(url) && !data && !error && (isLoading || isValidating)

  return {
    data: data ?? null,
    loading,
    validating: Boolean(url) && isValidating,
    error: error instanceof Error ? error.message : null,
    mutate,
  }
}

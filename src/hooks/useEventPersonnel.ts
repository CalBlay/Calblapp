// file: src/hooks/useEventPersonnel.ts
'use client'

import { useMemo } from 'react'
import useSWR from 'swr'

export interface Person {
  id?: string
  name?: string
  displayName?: string
  role?: string
  phone?: string
  department?: string
  meetingPoint?: string
  time?: string
  plannedStartTime?: string
  startTimeReal?: string
  plate?: string
  endTime?: string
  endTimeReal?: string
  notes?: string
  noShow?: boolean
  lateArrival?: boolean
  leftEarly?: boolean
  closingRevision?: number
  closingChangedAt?: string
  closingCorrectionReason?: string
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

export function useEventPersonnel(
  eventId?: string | number,
  enabled = true,
  scope?: { quadrantId?: string; phaseType?: string }
) {
  const canonicalId = useMemo(() => canonicalEventId(eventId), [eventId])
  const quadrantId = String(scope?.quadrantId || '').trim()
  const phaseType = String(scope?.phaseType || '').trim()

  const url = useMemo(() => {
    if (!canonicalId || !enabled) return null
    const params = new URLSearchParams({ eventId: canonicalId })
    if (quadrantId) params.set('quadrantId', quadrantId)
    else if (phaseType) params.set('phaseType', phaseType)
    return `/api/events/personnel?${params.toString()}`
  }, [canonicalId, enabled, phaseType, quadrantId])

  const { data, error, isLoading, isValidating, mutate } = useSWR<EventPersonnel>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
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

// file: src/hooks/useFetch.ts
'use client'

import useSWR from 'swr'
import { useMemo } from 'react'

type QuadrantsListResponse = { events?: unknown[] }

function buildKey(url: string, start?: string, end?: string): string | null {
  if (!url) return null
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

export default function useFetch(url: string, start?: string, end?: string) {
  const key = useMemo(() => buildKey(url, start, end), [url, start, end])

  const { data, error, isLoading } = useSWR<QuadrantsListResponse>(key)

  return {
    data: Array.isArray(data?.events) ? data!.events! : [],
    loading: isLoading,
    error,
  }
}

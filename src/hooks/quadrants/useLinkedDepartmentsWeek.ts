//filename: src/hooks/quadrants/useLinkedDepartmentsWeek.ts
'use client'

import { useMemo } from 'react'
import useSWR from 'swr'

/**
 * 🧩 Tipus de dades retornades per /api/quadrants/linked
 */
export interface LinkedDept {
  dept: string
  startTime?: string
  responsable?: string
}

type LinkedMap = Record<string, LinkedDept[]>

const linkedFetcher = async (url: string): Promise<LinkedMap> => {
  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return (json.linked || {}) as LinkedMap
}

const EMPTY_MAP: LinkedMap = {}

/**
 * 🧠 Hook optimitzat per carregar tots els enllaços de departaments
 * segons el rang setmanal (start / end). Servidor cacheja amb tag de
 * QUADRANTS_LIST_CACHE_TAG; aqui dedupliquem amb SWR.
 *
 * Exemple:
 *   const { linkedData, loading } = useLinkedDepartmentsWeek('2025-11-03', '2025-11-09')
 *   linkedData['E2500161'] -> [{ dept: 'serveis', startTime: '11:00' }]
 */
export default function useLinkedDepartmentsWeek(start?: string, end?: string) {
  const url = useMemo(() => {
    if (!start || !end) return null
    return `/api/quadrants/linked?start=${start}&end=${end}`
  }, [start, end])

  const { data, error, isLoading } = useSWR<LinkedMap>(url, linkedFetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 60_000,
    keepPreviousData: true,
  })

  return {
    linkedData: data ?? EMPTY_MAP,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

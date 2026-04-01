//filename:src\app\menu\quadrants\hooks\useQuadrants.ts
'use client'

import { useEffect, useState, useCallback } from 'react'

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
  // Camps provinents del quadrant si existeix
  status?: 'pending' | 'draft' | 'confirmed'
  department?: string
  responsableName?: string
  totalWorkers?: number
  numDrivers?: number
  [key: string]: unknown
}

/**
 * 🔹 Hook que carrega tots els esdeveniments confirmats (stage_verd)
 * i comprova a Firestore si existeix el seu quadrant dins del departament.
 * Retorna la llista d'esdeveniments amb tota la informació fusionada.
 */
export function useQuadrants(department: string, start?: string, end?: string) {
  const [quadrants, setQuadrants] = useState<QuadrantEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!department || !start || !end) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('department', department)
      params.set('start', start)
      params.set('end', end)

      const url = `/api/quadrants/get?${params.toString()}`
      console.log('[useQuadrants] 🔗 Crida API:', url)

      const res = await fetch(url, { cache: 'no-store', signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      const data = json?.quadrants || json?.events || []

      console.log(`[useQuadrants] ✅ Rebuts ${data.length} quadrants`)
      if (!signal?.aborted) setQuadrants(data)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[useQuadrants] ❌ Error carregant dades:', err)
      setError(err)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [department, start, end])

  // 🔁 Ara es recarrega cada cop que canvia el departament o el rang
  useEffect(() => {
    if (!department || !start || !end) return
    const controller = new AbortController()
    fetchData(controller.signal)
    return () => {
      controller.abort()
    }
  }, [department, start, end, fetchData])

  return { quadrants, loading, error, reload: fetchData }
}

export default useQuadrants

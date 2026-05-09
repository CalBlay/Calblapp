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
  status?: 'pending' | 'draft' | 'confirmed'
  department?: string
  responsableName?: string
  totalWorkers?: number
  numDrivers?: number
  [key: string]: unknown
}

export function useQuadrants(department: string, start?: string, end?: string) {
  const [quadrants, setQuadrants] = useState<QuadrantEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const fetchData = useCallback(
    async (opts?: { signal?: AbortSignal; silent?: boolean }) => {
      if (!department || !start || !end) return

      const signal = opts?.signal
      const silent = opts?.silent === true

      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const params = new URLSearchParams()
        params.set('department', department)
        params.set('start', start)
        params.set('end', end)

        const res = await fetch(`/api/quadrants/get?${params.toString()}`, {
          cache: 'no-store',
          signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()
        const data = json?.quadrants || json?.events || []
        if (!signal?.aborted) setQuadrants(data)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        console.error('[useQuadrants] Error carregant dades:', err)
        if (!silent) setError(err)
      } finally {
        if (!signal?.aborted && !silent) setLoading(false)
      }
    },
    [department, start, end]
  )

  useEffect(() => {
    if (!department || !start || !end) return
    const controller = new AbortController()
    void fetchData({ signal: controller.signal, silent: false })
    return () => {
      controller.abort()
    }
  }, [department, start, end, fetchData])

  const reload = useCallback(() => fetchData({ silent: true }), [fetchData])

  return { quadrants, loading, error, reload }
}

export default useQuadrants

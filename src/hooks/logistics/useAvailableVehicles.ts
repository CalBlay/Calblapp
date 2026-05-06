'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export type AvailableVehicle = {
  id: string
  plate: string
  type: string
  available: boolean
  conductorId?: string | null
}

type UseAvailableVehiclesOptions = {
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  department?: string
  enabled?: boolean
}

type CacheEntry = {
  data?: AvailableVehicle[]
  promise?: Promise<AvailableVehicle[]>
  ts: number
}

const CACHE_TTL_MS = 30000
const vehiclesCache = new Map<string, CacheEntry>()

export function invalidateAvailableVehiclesCache() {
  vehiclesCache.clear()
}

async function fetchVehicles(opts: Required<Pick<UseAvailableVehiclesOptions, 'startDate' | 'startTime' | 'endDate' | 'endTime'>> & Pick<UseAvailableVehiclesOptions, 'department'>) {
  const res = await fetch('/api/transports/available', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: opts.startDate,
      startTime: opts.startTime,
      endDate: opts.endDate,
      endTime: opts.endTime,
      department: opts.department,
    }),
  })

  if (!res.ok) {
    throw new Error(await res.text() || 'No sha pogut carregar la disponibilitat de vehicles')
  }

  const data = await res.json()
  return Array.isArray(data?.vehicles) ? data.vehicles : []
}

function getCachedVehicles(key: string) {
  const entry = vehiclesCache.get(key)
  if (!entry) return null
  if (entry.data && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data
  return null
}

async function loadVehicles(key: string, opts: Required<Pick<UseAvailableVehiclesOptions, 'startDate' | 'startTime' | 'endDate' | 'endTime'>> & Pick<UseAvailableVehiclesOptions, 'department'>) {
  const existing = vehiclesCache.get(key)
  if (existing?.promise) return existing.promise

  const promise = fetchVehicles(opts)
    .then((data) => {
      vehiclesCache.set(key, { data, ts: Date.now() })
      return data
    })
    .catch((error) => {
      vehiclesCache.delete(key)
      throw error
    })

  vehiclesCache.set(key, { data: existing?.data, promise, ts: existing?.ts || 0 })
  return promise
}

export function useAvailableVehicles(opts: UseAvailableVehiclesOptions) {
  const { startDate, startTime, endDate, endTime, department } = opts
  const enabled = opts.enabled ?? true
  const key = useMemo(
    () => [startDate || '', startTime || '', endDate || '', endTime || '', department || ''].join('|'),
    [startDate, startTime, endDate, endTime, department]
  )
  const initialData = useMemo(() => (enabled ? getCachedVehicles(key) || [] : []), [enabled, key])

  const [vehicles, setVehicles] = useState<AvailableVehicle[]>(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canFetch =
    enabled &&
    Boolean(startDate && startTime && endDate && endTime)

  const refetch = useCallback(async (force = false) => {
    if (!canFetch) {
      setVehicles([])
      setError(null)
      return
    }

    const cached = force ? null : getCachedVehicles(key)
    if (cached) {
      setVehicles(cached)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await loadVehicles(key, {
        startDate: startDate!,
        startTime: startTime!,
        endDate: endDate!,
        endTime: endTime!,
        department,
      })
      setVehicles(data)
    } catch (err) {
      setVehicles([])
      setError(err instanceof Error ? err.message : 'Error carregant vehicles')
    } finally {
      setLoading(false)
    }
  }, [canFetch, key, startDate, startTime, endDate, endTime, department])

  useEffect(() => {
    setVehicles(initialData)
  }, [initialData])

  useEffect(() => {
    refetch()
  }, [refetch])

  return {
    vehicles,
    loading,
    error,
    refetch,
  }
}

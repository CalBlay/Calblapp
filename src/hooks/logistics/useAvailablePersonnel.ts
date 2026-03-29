'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export interface PersonnelOption {
  id: string
  name: string
  role: string
  status: 'available' | 'conflict' | 'notfound'
  reason?: string
  isDriver?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

export interface UseAvailablePersonnelOptions {
  departament?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  excludeIds?: string[]
  excludeNames?: string[]
  excludeEventId?: string
  enabled?: boolean
}

type PersonnelPayload = {
  responsables: PersonnelOption[]
  conductors: PersonnelOption[]
  treballadors: PersonnelOption[]
}

type CacheEntry = {
  data?: PersonnelPayload
  promise?: Promise<PersonnelPayload>
  ts: number
}

const CACHE_TTL_MS = 30000
const personnelCache = new Map<string, CacheEntry>()

export function invalidateAvailablePersonnelCache() {
  personnelCache.clear()
}

const normalize = (value?: string) => String(value || '').toLowerCase().trim()

const buildKey = (opts: UseAvailablePersonnelOptions) =>
  [
    opts.departament || '',
    opts.startDate || '',
    opts.endDate || '',
    opts.startTime || '',
    opts.endTime || '',
    opts.excludeEventId || '',
  ].join('|')

const cleanList = (
  arr: Array<Omit<PersonnelOption, 'status'> & { status?: string }>,
  excludeIds: Set<string>,
  excludeNames: Set<string>
): PersonnelOption[] =>
  arr
    .filter((person) => {
      const pid = normalize(person.id)
      const pname = normalize(person.name)
      if (pid && excludeIds.has(pid)) return false
      if (pname && excludeNames.has(pname)) return false
      return true
    })
    .map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      status: (person.status as PersonnelOption['status']) || 'notfound',
      reason: person.reason,
      isDriver: person.isDriver === true,
      camioPetit: person.camioPetit === true,
      camioGran: person.camioGran === true,
    }))

async function fetchPersonnel(opts: Required<Pick<UseAvailablePersonnelOptions, 'departament' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>> & Pick<UseAvailablePersonnelOptions, 'excludeEventId'>) {
  const params = new URLSearchParams({
    department: opts.departament,
    startDate: opts.startDate,
    endDate: opts.endDate,
    startTime: opts.startTime,
    endTime: opts.endTime,
  })
  if (opts.excludeEventId) params.set('excludeEventId', opts.excludeEventId)

  const res = await fetch(`/api/personnel/available?${params.toString()}`)
  if (!res.ok) {
    throw new Error(await res.text() || 'No sha pogut carregar el personal disponible')
  }

  const data = await res.json()
  return {
    responsables: Array.isArray(data?.responsables) ? data.responsables : [],
    conductors: Array.isArray(data?.conductors) ? data.conductors : [],
    treballadors: Array.isArray(data?.treballadors) ? data.treballadors : [],
  }
}

function getCachedPayload(key: string) {
  const entry = personnelCache.get(key)
  if (!entry) return null
  if (entry.data && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data
  return null
}

async function loadPersonnel(key: string, opts: Required<Pick<UseAvailablePersonnelOptions, 'departament' | 'startDate' | 'endDate' | 'startTime' | 'endTime'>> & Pick<UseAvailablePersonnelOptions, 'excludeEventId'>) {
  const existing = personnelCache.get(key)
  if (existing?.promise) return existing.promise

  const promise = fetchPersonnel(opts)
    .then((data) => {
      personnelCache.set(key, { data, ts: Date.now() })
      return data
    })
    .catch((error) => {
      personnelCache.delete(key)
      throw error
    })

  personnelCache.set(key, { data: existing?.data, promise, ts: existing?.ts || 0 })
  return promise
}

export function useAvailablePersonnel(opts: UseAvailablePersonnelOptions) {
  const enabled = opts.enabled ?? true
  const key = useMemo(() => buildKey(opts), [
    opts.departament,
    opts.startDate,
    opts.endDate,
    opts.startTime,
    opts.endTime,
    opts.excludeEventId,
  ])
  const initialPayload = useMemo(
    () => (enabled ? getCachedPayload(key) : null),
    [enabled, key]
  )

  const excludeIds = useMemo(
    () => new Set((opts.excludeIds ?? []).map((value) => normalize(value))),
    [opts.excludeIds]
  )
  const excludeNames = useMemo(
    () => new Set((opts.excludeNames ?? []).map((value) => normalize(value))),
    [opts.excludeNames]
  )

  const [payload, setPayload] = useState<PersonnelPayload>(
    initialPayload || { responsables: [], conductors: [], treballadors: [] }
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canFetch =
    enabled &&
    Boolean(
      opts.departament &&
      opts.startDate &&
      opts.endDate &&
      opts.startTime &&
      opts.endTime
    )

  const refetchPersonnel = useCallback(async () => {
    if (!canFetch) {
      setPayload({ responsables: [], conductors: [], treballadors: [] })
      setError(null)
      return
    }

    const cached = getCachedPayload(key)
    if (cached) {
      setPayload(cached)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await loadPersonnel(key, {
        departament: opts.departament!,
        startDate: opts.startDate!,
        endDate: opts.endDate!,
        startTime: opts.startTime!,
        endTime: opts.endTime!,
        excludeEventId: opts.excludeEventId,
      })
      setPayload(data)
    } catch (err) {
      setPayload({ responsables: [], conductors: [], treballadors: [] })
      setError(err instanceof Error ? err.message : 'Error carregant personal disponible')
    } finally {
      setLoading(false)
    }
  }, [canFetch, key, opts.departament, opts.startDate, opts.endDate, opts.startTime, opts.endTime, opts.excludeEventId])

  useEffect(() => {
    if (initialPayload) setPayload(initialPayload)
  }, [initialPayload])

  useEffect(() => {
    refetchPersonnel()
  }, [refetchPersonnel])

  return {
    responsables: cleanList(payload.responsables, excludeIds, excludeNames),
    conductors: cleanList(payload.conductors, excludeIds, excludeNames),
    treballadors: cleanList(payload.treballadors, excludeIds, excludeNames),
    loading,
    error,
    refetchPersonnel,
  }
}

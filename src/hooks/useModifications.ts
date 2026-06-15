//filename: src/hooks/useModifications.ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCallback } from 'react'

export interface Modification {
  id: string
  modificationNumber?: string
  eventId: string
  eventCode?: string
  eventTitle?: string
  eventDate?: string
  eventLocation?: string
  eventCommercial?: string
  department: string
  createdBy: string
  createdById?: string
  createdByEmail?: string
  tipus?: string
  category?: { id: string; label: string }
  importance: string
  description: string
  createdAt: string
  updatedAt?: string
}

const modificationsCache: Record<string, Modification[]> = {}

type FirestoreTimestampLike = { toDate?: () => Date }

const normalizeTimestamp = (ts: unknown): string => {
  const maybeTimestamp = ts as FirestoreTimestampLike
  if (maybeTimestamp && typeof maybeTimestamp.toDate === 'function') return maybeTimestamp.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

export function useModifications(filters: {
  from?: string
  to?: string
  department?: string
  eventId?: string
  importance?: string
  categoryId?: string
  categoryLabel?: string
  commercial?: string
  /** Si és `false`, no es fa cap fetch (p. ex. modal tancat). */
  enabled?: boolean
}) {
  const enabled = filters.enabled !== false
  const [modifications, setModifications] = useState<Modification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const fetchKey = useMemo(() => {
    const { enabled: _enabled, ...rest } = filters
    return JSON.stringify(rest)
  }, [filters])

  const fetchModifications = useCallback(async () => {
    if (!enabled) {
      setModifications([])
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      if (modificationsCache[fetchKey]) {
        setModifications(modificationsCache[fetchKey])
        setLoading(false)
        return
      }

      const params = new URLSearchParams()
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      if (filters.eventId) params.set('eventId', filters.eventId)
      if (filters.department && filters.department !== 'all')
        params.set('department', filters.department)
      if (filters.importance && filters.importance !== 'all')
        params.set('importance', filters.importance.toLowerCase())
      if (filters.commercial && filters.commercial !== 'all')
        params.set('commercial', filters.commercial)

      const categoryLabel =
        filters.categoryLabel && filters.categoryLabel !== 'all'
          ? filters.categoryLabel
          : filters.categoryId && filters.categoryId !== 'all'
          ? filters.categoryId
          : null

      if (categoryLabel) params.set('categoryLabel', categoryLabel)

      const res = await fetch(`/api/modifications?${params.toString()}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
      const data = await res.json()

      const mods = (data.modifications || []) as Modification[]
      modificationsCache[fetchKey] = mods
      setModifications(mods)
    } catch (err) {
      console.warn('[useModifications] Error carregant modificacions:', err)
      setError('Error carregant registres de modificacions')
    } finally {
      setLoading(false)
    }
  }, [enabled, fetchKey, filters])

  useEffect(() => {
    fetchModifications()
  }, [fetchModifications])

  const updateModification = async (id: string, data: Partial<Modification>) => {
    const res = await fetch(`/api/modifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = await res.json()
    const updated = payload?.modification
      ? {
          ...payload.modification,
          createdAt: normalizeTimestamp(payload.modification.createdAt),
          updatedAt: normalizeTimestamp(payload.modification.updatedAt),
        }
      : null

    setModifications((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...(updated || data) } : m))
    )

    if (modificationsCache[fetchKey]) {
      modificationsCache[fetchKey] = modificationsCache[fetchKey].map((m) =>
        m.id === id ? { ...m, ...(updated || data) } : m
      )
    }

    return updated
  }

  const refetch = () => {
    delete modificationsCache[fetchKey]
    return fetchModifications()
  }

  const deleteModification = async (id: string) => {
    const res = await fetch(`/api/modifications/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    setModifications((prev) => prev.filter((m) => m.id !== id))
    if (modificationsCache[fetchKey]) {
      modificationsCache[fetchKey] = modificationsCache[fetchKey].filter((m) => m.id !== id)
    }
  }

  return { modifications, loading, error, updateModification, deleteModification, refetch }
}

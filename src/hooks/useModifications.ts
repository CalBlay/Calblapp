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
  const {
    from,
    to,
    department,
    eventId,
    importance,
    categoryId,
    categoryLabel,
    commercial,
    enabled: enabledOption,
  } = filters
  const enabled = enabledOption !== false

  const [modifications, setModifications] = useState<Modification[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const fetchKey = useMemo(
    () =>
      JSON.stringify({
        from,
        to,
        department,
        eventId,
        importance,
        categoryId,
        categoryLabel,
        commercial,
      }),
    [from, to, department, eventId, importance, categoryId, categoryLabel, commercial]
  )

  const fetchModifications = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      if (modificationsCache[fetchKey]) {
        setModifications(modificationsCache[fetchKey])
        setLoading(false)
        return
      }

      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (eventId) params.set('eventId', eventId)
      if (department && department !== 'all') params.set('department', department)
      if (importance && importance !== 'all') params.set('importance', importance.toLowerCase())
      if (commercial && commercial !== 'all') params.set('commercial', commercial)

      const resolvedCategoryLabel =
        categoryLabel && categoryLabel !== 'all'
          ? categoryLabel
          : categoryId && categoryId !== 'all'
            ? categoryId
            : null

      if (resolvedCategoryLabel) params.set('categoryLabel', resolvedCategoryLabel)

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
  }, [fetchKey, from, to, department, eventId, importance, categoryId, categoryLabel, commercial])

  useEffect(() => {
    if (!enabled) return
    void fetchModifications()
  }, [enabled, fetchModifications])

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

'use client'

import { useEffect, useState, useMemo } from 'react'

export interface Incident {
  id: string
  createdAt: string
  department: string
  description: string
  eventId: string
  eventTitle?: string
  eventCode?: string
  eventLocation?: string
  eventDate?: string
  eventCommercial?: string
  importance: string
  status: string
  createdBy?: string
  category?: { id: string; label: string }
  ln?: string
  pax?: number
  serviceType?: string
  fincaId?: string
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
}

const normalizeTimestamp = (ts: any): string => {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return ''
}

const normalizeImportance = (value?: string): string => {
  const v = (value || '').toLowerCase().trim()
  if (v === 'mitjana') return 'normal'
  if (v === 'urgent') return 'urgent'
  if (v === 'alta') return 'alta'
  if (v === 'baixa') return 'baixa'
  return v || 'normal'
}

export function useIncidents(_filters: {
  eventId?: string
  from?: string
  to?: string
  department?: string
  importance?: string
  categoryLabel?: string
  refreshKey?: number
}) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 🧠 IMPORTANT — Filtre memoitzat
  const filters = useMemo(
    () => ({
      eventId: _filters.eventId,
      from: _filters.from,
      to: _filters.to,
      department: _filters.department,
      importance: _filters.importance,
      categoryLabel: _filters.categoryLabel,
      refreshKey: _filters.refreshKey ?? 0,
    }),
    [
      _filters.eventId,
      _filters.from,
      _filters.to,
      _filters.department,
      _filters.importance,
      _filters.categoryLabel,
      _filters.refreshKey,
    ]
  )

  useEffect(() => {
    let cancel = false

    async function load() {
      try {
        setLoading(true)
        setError(null)

        const qs = new URLSearchParams()

        // 🔑 FILTRE CLAU PER ESDEVENIMENT
        if (filters.eventId) qs.set('eventId', filters.eventId)

        if (filters.from) qs.set('from', filters.from)
        if (filters.to) qs.set('to', filters.to)
        if (filters.department) qs.set('department', filters.department)
        if (filters.importance && filters.importance !== 'all')
          qs.set('importance', filters.importance)
        if (filters.categoryLabel && filters.categoryLabel !== 'all')
          qs.set('categoryId', filters.categoryLabel)

        const res = await fetch(`/api/incidents?${qs.toString()}`, {
          cache: 'no-store',
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json()

        const raw = Array.isArray(data.incidents)
          ? data.incidents
          : Array.isArray(data)
          ? data
          : []

        if (!cancel) {
          const normalized = raw.map((inc: any) => ({
            ...inc,
            importance: normalizeImportance(inc.importance),
          }))
          setIncidents(normalized as Incident[])
        }
      } catch (err: any) {
        if (!cancel) setError(err.message || 'Error carregant incidències')
      } finally {
        if (!cancel) setLoading(false)
      }
    }

    load()
    return () => {
      cancel = true
    }
  }, [
    filters.eventId,
    filters.from,
    filters.to,
    filters.department,
    filters.importance,
    filters.categoryLabel,
    filters.refreshKey,
  ])

  const updateIncident = async (id: string, data: Partial<Incident>) => {
    try {
      setError(null)

      const res = await fetch(`/api/incidents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const payload = await res.json()
      const updated = payload?.incident
        ? {
            ...payload.incident,
            createdAt: normalizeTimestamp(payload.incident.createdAt),
          }
        : null

      if (updated) {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === id ? { ...inc, ...updated } : inc))
        )
      } else {
        setIncidents((prev) =>
          prev.map((inc) => (inc.id === id ? { ...inc, ...data } : inc))
        )
      }

      return updated
    } catch (err: any) {
      const msg = err?.message || 'Error actualitzant incidència'
      setError(msg)
      return null
    }
  }

  return { incidents, loading, error, updateIncident }
}

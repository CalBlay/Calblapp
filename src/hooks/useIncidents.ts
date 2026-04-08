'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { normalizeIncidentStatus } from '@/lib/incidentPolicy'

export interface Incident {
  id: string
  createdAt: string
  department: string
  description: string
  incidentNumber?: string
  eventId: string
  eventTitle?: string
  eventCode?: string
  eventLocation?: string
  eventDate?: string
  eventCommercial?: string
  originDepartment?: string
  importance: string
  priority?: string
  status: string
  createdBy?: string
  category?: { id: string; label: string }
  ln?: string
  pax?: number
  serviceType?: string
  fincaId?: string
  resolutionNote?: string
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
  images?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string } | null
  }>
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

function normalizeIncidentRow(inc: any): Incident {
  return {
    ...inc,
    importance: normalizeImportance(inc.importance),
    images:
      Array.isArray(inc.images) && inc.images.length > 0
        ? inc.images
        : inc.imageUrl || inc.imagePath
          ? [
              {
                url: inc.imageUrl || null,
                path: inc.imagePath || null,
                meta: inc.imageMeta || null,
              },
            ]
          : [],
  } as Incident
}

export function useIncidents(_filters: {
  eventId?: string
  from?: string
  to?: string
  department?: string
  importance?: string
  categoryLabel?: string
  /** Filtra per estat de resolució (client, sobre el resultat de l’API) */
  status?: 'all' | 'obert' | 'en_curs' | 'resolt' | 'tancat'
  refreshKey?: number
  /** Màxim documents (API cap 1000; per defecte 300 si s'omet) */
  limit?: number
  /**
   * `true`: `GET` amb `light=1` (sense dades d’imatges al JSON; menys pes de xarxa).
   * `false`: resposta completa (p. ex. modal amb fotos).
   */
  light?: boolean
  /** Si és `false`, no es fa cap fetch (p. ex. modal tancat). Per defecte `true`. */
  enabled?: boolean
}) {
  /** Dades de l’API (sense filtre client d’estat). */
  const [rawIncidents, setRawIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Per no bloquejar la UI amb “Carregant…” quan ja hi ha dades (canvi de setmana/filtres). */
  const hadDataRef = useRef(false)

  // 🧠 IMPORTANT — Filtre memoitzat (abans del derive d’incidents)
  const filters = useMemo(
    () => ({
      eventId: _filters.eventId,
      from: _filters.from,
      to: _filters.to,
      department: _filters.department,
      importance: _filters.importance,
      categoryLabel: _filters.categoryLabel,
      status: _filters.status ?? 'all',
      refreshKey: _filters.refreshKey ?? 0,
      limit: _filters.limit,
      light: _filters.light ?? false,
      enabled: _filters.enabled !== false,
    }),
    [
      _filters.eventId,
      _filters.from,
      _filters.to,
      _filters.department,
      _filters.importance,
      _filters.categoryLabel,
      _filters.status,
      _filters.refreshKey,
      _filters.limit,
      _filters.light,
      _filters.enabled,
    ]
  )

  const incidents = useMemo(() => {
    if (!filters.status || filters.status === 'all') return rawIncidents
    return rawIncidents.filter(
      (inc) => normalizeIncidentStatus(inc.status) === filters.status
    )
  }, [rawIncidents, filters.status])

  useEffect(() => {
    let cancel = false

    async function load() {
      if (!filters.enabled) {
        if (!cancel) {
          setRawIncidents([])
          setLoading(false)
          setIsRefreshing(false)
          hadDataRef.current = false
        }
        return
      }

      const blocking = !hadDataRef.current
      if (blocking) {
        setLoading(true)
        setIsRefreshing(false)
      } else {
        setIsRefreshing(true)
        setLoading(false)
      }
      setError(null)

      try {
        const qs = new URLSearchParams()

        if (filters.eventId) qs.set('eventId', filters.eventId)

        if (filters.from) qs.set('from', filters.from)
        if (filters.to) qs.set('to', filters.to)
        if (filters.department) qs.set('department', filters.department)
        if (filters.importance && filters.importance !== 'all')
          qs.set('importance', filters.importance)
        if (filters.categoryLabel && filters.categoryLabel !== 'all')
          qs.set('categoryLabel', filters.categoryLabel)
        if (typeof filters.limit === 'number' && filters.limit > 0) {
          qs.set('limit', String(Math.min(1000, Math.floor(filters.limit))))
        }
        if (filters.light) qs.set('light', '1')

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
          const normalized = raw.map((inc: any) => normalizeIncidentRow(inc)) as Incident[]
          setRawIncidents(normalized)
          hadDataRef.current = normalized.length > 0
        }
      } catch (err: any) {
        if (!cancel) setError(err.message || 'Error carregant incidències')
      } finally {
        if (!cancel) {
          setLoading(false)
          setIsRefreshing(false)
        }
      }
    }

    void load()
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
    filters.limit,
    filters.light,
    filters.enabled,
  ])

  const updateIncident = useCallback(async (id: string, data: Partial<Incident>) => {
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
        setRawIncidents((prev) =>
          prev.map((inc) => {
            if (inc.id !== id) return inc
            const merged = {
              ...inc,
              ...updated,
              importance: normalizeImportance((updated as Incident).importance),
              createdAt: normalizeTimestamp((updated as Incident).createdAt),
            }
            return normalizeIncidentRow(merged)
          })
        )
      } else {
        setRawIncidents((prev) =>
          prev.map((inc) =>
            inc.id === id ? normalizeIncidentRow({ ...inc, ...data }) : inc
          )
        )
      }

      return updated
    } catch (err: any) {
      const msg = err?.message || 'Error actualitzant incidència'
      setError(msg)
      return null
    }
  }, [])

  return { incidents, rawIncidents, loading, isRefreshing, error, updateIncident }
}

//filename: src/hooks/usePissarra.ts
'use client'

import { useEffect, useMemo, useState } from 'react'

export interface PissarraItem {
  id: string
  code: string
  LN?: string
  eventName?: string
  startDate?: string
  startTime?: string
  arrivalTime?: string
  location?: string
  pax?: number
  servei?: string
  comercial?: string
  phaseLabel?: string
  phaseDate?: string
  status?: string
  responsableName?: string
  group1Responsible?: string | null
  group1Drivers?: string[]
  group1Workers?: string[]
  group1MeetingPoint?: string
  group1StartTime?: string
  group2Responsible?: string | null
  group2Drivers?: string[]
  group2Workers?: string[]
  group2MeetingPoint?: string
  group2StartTime?: string
  HoraInici?: string
  horaInici?: string
  vehicles?: { plate?: string; type?: string; conductor?: string; source?: string }[]
  workers?: string[]
}

type Mode = 'produccio' | 'logistica' | 'cuina'

export default function usePissarra(
  weekStart: string,
  weekEnd: string,
  role?: string,
  department?: string,
  mode: Mode = 'produccio'
) {
  const [flat, setFlat] = useState<PissarraItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  const canEdit =
    mode === 'produccio' && (role === 'admin' || department === 'produccio')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        const endpoint =
          mode === 'logistica'
            ? `/api/pissarra/logistica?start=${weekStart}&end=${weekEnd}`
            : mode === 'cuina'
            ? `/api/pissarra/cuina?start=${weekStart}&end=${weekEnd}`
            : `/api/pissarra?start=${weekStart}&end=${weekEnd}`

        const res = await fetch(endpoint, { cache: 'no-store' })
        const data = await res.json()
        if (active) setFlat(data.items || [])
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [weekStart, weekEnd, mode])

  const dataByDay = useMemo(() => {
    const grouped: Record<string, PissarraItem[]> = {}
    flat.forEach((ev) => {
      const day = ev.startDate || 'sense-data'
      if (!grouped[day]) grouped[day] = []
      grouped[day].push(ev)
    })
    return grouped
  }, [flat])

  async function updateField(id: string, payload: Partial<PissarraItem>) {
    if (mode !== 'produccio') return
    await fetch('/api/pissarra/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payload }),
    })
    setFlat((prev) => prev.map((e) => (e.id === id ? { ...e, ...payload } : e)))
  }

  return { dataByDay, flat, loading, error, canEdit, updateField }
}

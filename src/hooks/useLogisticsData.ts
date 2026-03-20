'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

interface LogisticsEvent {
  id: string
  NomEvent: string
  Ubicacio: string
  NumPax?: number
  DataInici: string
  DataVisual?: string
  HoraInici?: string
  PreparacioData?: string
  PreparacioHora?: string
}

export function useLogisticsData(dateRange?: { start: string; end: string } | null) {
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()

  const [events, setEvents] = useState<LogisticsEvent[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      if (!dateRange?.start || !dateRange?.end) {
        setEvents([])
        return
      }

      const url = `/api/logistics?start=${dateRange.start}&end=${dateRange.end}`
      const res = await fetch(url, { cache: 'no-store' })

      if (!res.ok) {
        console.error('Error API logistics:', await res.text())
        setEvents([])
        return
      }

      const { ok, events: data } = (await res.json()) as {
        ok: boolean
        events: LogisticsEvent[]
      }

      if (!ok || !data) {
        setEvents([])
        return
      }

      const visible =
        role === 'treballador'
          ? data.filter((event) => event.PreparacioData && event.PreparacioHora)
          : data

      setEvents(visible)
    } catch (err) {
      console.error('Error carregant dades logistiques:', err)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [role, dateRange?.start, dateRange?.end])

  useEffect(() => {
    loadData()
  }, [loadData])

  return { events, loading, refresh: loadData }
}

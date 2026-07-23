'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import type {
  LogisticsEventPrepRow,
  LogisticsWarehousePrepRow,
} from '@/lib/logistics/prepTypes'

export type { LogisticsEventPrepRow, LogisticsWarehousePrepRow }

const FETCH_TIMEOUT_MS = 45_000

export function useLogisticsData(
  dateRange?: { start: string; end: string } | null,
  options?: { preparerMode?: boolean }
) {
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()
  const preparerMode = Boolean(options?.preparerMode)
  const isSingleDayFilter = Boolean(
    dateRange?.start &&
    dateRange?.end &&
    dateRange.start === dateRange.end
  )
  const filterByPreparation = preparerMode || isSingleDayFilter

  const [events, setEvents] = useState<LogisticsEventPrepRow[]>([])
  const [warehouseTasks, setWarehouseTasks] = useState<LogisticsWarehousePrepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hadDataRef = useRef(false)
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++requestIdRef.current
    const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

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
      if (!dateRange?.start || !dateRange?.end) {
        if (requestId !== requestIdRef.current) return
        setEvents([])
        setWarehouseTasks([])
        hadDataRef.current = false
        return
      }

      const prepQuery = filterByPreparation ? '&filterByPreparation=1' : ''
      const url = `/api/logistics?start=${dateRange.start}&end=${dateRange.end}${prepQuery}`
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal })

      if (requestId !== requestIdRef.current) return

      if (!res.ok) {
        console.error('Error API logistics:', await res.text())
        if (!hadDataRef.current) {
          setEvents([])
          setWarehouseTasks([])
        }
        setError('No s\'han pogut carregar les dades de logística.')
        return
      }

      const { ok, events: data, warehouseTasks: warehouseData } = (await res.json()) as {
        ok: boolean
        events: LogisticsEventPrepRow[]
        warehouseTasks?: LogisticsWarehousePrepRow[]
      }

      if (requestId !== requestIdRef.current) return

      if (!ok || !data) {
        if (!hadDataRef.current) {
          setEvents([])
          setWarehouseTasks([])
        }
        setError('No s\'han pogut carregar les dades de logística.')
        return
      }

      const eventRows: LogisticsEventPrepRow[] = data.map((event) => ({
        ...event,
        rowType: 'event' as const,
      }))

      const visibleEvents = preparerMode
        ? eventRows.filter((event) => event.PreparacioData && event.PreparacioHora)
        : eventRows

      const nextWarehouseTasks = Array.isArray(warehouseData)
        ? warehouseData.map((task) => ({ ...task, rowType: 'warehouse_comanda' as const }))
        : []

      setEvents(visibleEvents)
      setWarehouseTasks(nextWarehouseTasks)
      hadDataRef.current = visibleEvents.length > 0 || nextWarehouseTasks.length > 0
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      console.error('Error carregant dades logistiques:', err)
      if (!hadDataRef.current) {
        setEvents([])
        setWarehouseTasks([])
      }
      setError(
        isAbort
          ? 'La càrrega ha trigat massa. Torna-ho a provar o redueix el rang de dates.'
          : 'No s\'han pogut carregar les dades de logística.'
      )
    } finally {
      clearTimeout(timeoutId)
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [dateRange?.start, dateRange?.end, filterByPreparation, preparerMode])

  useEffect(() => {
    loadData()
    return () => {
      abortRef.current?.abort()
    }
  }, [loadData])

  return { events, warehouseTasks, loading, isRefreshing, error, refresh: loadData }
}

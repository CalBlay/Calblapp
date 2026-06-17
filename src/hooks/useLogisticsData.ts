'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import type {
  LogisticsEventPrepRow,
  LogisticsWarehousePrepRow,
} from '@/lib/logistics/prepTypes'

export type { LogisticsEventPrepRow, LogisticsWarehousePrepRow }

export function useLogisticsData(dateRange?: { start: string; end: string } | null) {
  const { data: session } = useSession()
  const role = (session?.user?.role || '').toLowerCase()
  const filterByPreparation = role === 'treballador'

  const [events, setEvents] = useState<LogisticsEventPrepRow[]>([])
  const [warehouseTasks, setWarehouseTasks] = useState<LogisticsWarehousePrepRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      if (!dateRange?.start || !dateRange?.end) {
        setEvents([])
        setWarehouseTasks([])
        return
      }

      const prepQuery = filterByPreparation ? '&filterByPreparation=1' : ''
      const url = `/api/logistics?start=${dateRange.start}&end=${dateRange.end}${prepQuery}`
      const res = await fetch(url, { cache: 'no-store' })

      if (!res.ok) {
        console.error('Error API logistics:', await res.text())
        setEvents([])
        setWarehouseTasks([])
        return
      }

      const { ok, events: data, warehouseTasks: warehouseData } = (await res.json()) as {
        ok: boolean
        events: LogisticsEventPrepRow[]
        warehouseTasks?: LogisticsWarehousePrepRow[]
      }

      if (!ok || !data) {
        setEvents([])
        setWarehouseTasks([])
        return
      }

      const eventRows: LogisticsEventPrepRow[] = data.map((event) => ({
        ...event,
        rowType: 'event' as const,
      }))

      const visibleEvents =
        role === 'treballador'
          ? eventRows.filter((event) => event.PreparacioData && event.PreparacioHora)
          : eventRows

      setEvents(visibleEvents)
      setWarehouseTasks(
        Array.isArray(warehouseData)
          ? warehouseData.map((task) => ({ ...task, rowType: 'warehouse_comanda' as const }))
          : []
      )
    } catch (err) {
      console.error('Error carregant dades logistiques:', err)
      setEvents([])
      setWarehouseTasks([])
    } finally {
      setLoading(false)
    }
  }, [dateRange?.start, dateRange?.end, filterByPreparation, role])

  useEffect(() => {
    loadData()
  }, [loadData])

  return { events, warehouseTasks, loading, refresh: loadData }
}

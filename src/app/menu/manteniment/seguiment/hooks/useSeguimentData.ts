'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MachineItem, Ticket, UserItem } from '@/app/menu/manteniment/tickets/types'
import type { Preventiu } from '../types'
import { buildSeguimentRows, fetcher } from '../utils'
import type { CenterRow } from '../../dades/types'
import { buildControlledMaintenanceLocations } from '@/lib/maintenanceLocationCatalog'

export function useSeguimentData() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [preventius, setPreventius] = useState<Preventiu[]>([])
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    try {
      if (!silent) {
        setLoading(true)
        setError('')
      }

      if (silent) {
        const [ticketsJson, plannedJson, completedJson] = await Promise.all([
          fetcher('/api/maintenance/tickets?ticketType=maquinaria&limit=300'),
          fetcher('/api/maintenance/preventius/planned'),
          fetcher('/api/maintenance/preventius/completed'),
        ])
        const { nextTickets, nextPreventius } = buildSeguimentRows(
          ticketsJson,
          plannedJson,
          completedJson
        )
        setTickets(nextTickets)
        setPreventius(nextPreventius)
        return
      }

      const [ticketsJson, plannedJson, completedJson, centersJson, machinesJson, usersJson] =
        await Promise.all([
          fetcher('/api/maintenance/tickets?ticketType=maquinaria&limit=300'),
          fetcher('/api/maintenance/preventius/planned'),
          fetcher('/api/maintenance/preventius/completed'),
          fetcher('/api/maintenance/data/centers'),
          fetcher('/api/maintenance/machines'),
          fetcher('/api/personnel?department=manteniment'),
        ])

      const { nextTickets, nextPreventius } = buildSeguimentRows(
        ticketsJson,
        plannedJson,
        completedJson
      )

      setTickets(nextTickets)
      setPreventius(nextPreventius)
      const nextCenters = Array.isArray(centersJson?.centers) ? centersJson.centers : []
      setCenters(nextCenters)
      setLocations(buildControlledMaintenanceLocations(nextCenters))
      setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])
      setUsers(Array.isArray(usersJson?.data) ? usersJson.data : [])
    } catch (err) {
      if (silent) {
        console.error('[seguiment] silent refresh failed', err)
        return
      }
      setError(err instanceof Error ? err.message : 'Error carregant seguiment')
      setTickets([])
      setPreventius([])
      setCenters([])
      setLocations([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const lastAutoRefreshAt = useRef(0)
  useEffect(() => {
    const throttleMs = 2500
    const ignoreFocusUntil = Date.now() + 900
    const maybeRefresh = () => {
      const now = Date.now()
      if (now - lastAutoRefreshAt.current < throttleMs) return
      lastAutoRefreshAt.current = now
      void loadData({ silent: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeRefresh()
    }
    const onFocus = () => {
      if (Date.now() < ignoreFocusUntil) return
      if (document.visibilityState === 'hidden') return
      maybeRefresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [loadData])

  return {
    tickets,
    setTickets,
    preventius,
    setPreventius,
    centers,
    locations,
    machines,
    users,
    loading,
    error,
    loadData,
  }
}

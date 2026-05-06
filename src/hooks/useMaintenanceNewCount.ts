'use client'

import { useEffect, useState } from 'react'
import { readSeenTickets, type TicketType } from '@/lib/maintenanceSeen'

type Options = {
  ticketType?: TicketType
}

type MaintenanceTicket = { id?: string }

export function useMaintenanceNewCount(options: Options = {}) {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const ticketType = options.ticketType
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const qs = new URLSearchParams({ status: 'nou' })
        if (ticketType) qs.set('ticketType', ticketType)
        const res = await fetch(`/api/maintenance/tickets?${qs.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('Error carregant tickets')
        const data = await res.json()
        const tickets = Array.isArray(data?.tickets) ? data.tickets : []
        const seen = readSeenTickets(ticketType)
        const pending = tickets.filter((t: MaintenanceTicket) => !seen.has(String(t?.id || '')))
        if (active) setCount(pending.length)
      } catch {
        if (active) setCount(0)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [ticketType, refreshKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setRefreshKey((v) => v + 1)
    window.addEventListener('maintenance-ticket-seen', handler as EventListener)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('maintenance-ticket-seen', handler as EventListener)
      window.removeEventListener('storage', handler)
    }
  }, [])

  return { count, loading }
}

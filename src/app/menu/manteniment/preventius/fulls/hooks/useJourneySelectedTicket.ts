'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { fetchTicketById, resolveJourneyTicket } from '../lib/api'
import type { JourneyTicket, TicketJourneyItem } from '../lib/types'

export function useJourneySelectedTicket(ticketItems: TicketJourneyItem[]) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryTicketId = (searchParams?.get('ticketId') || '').trim()

  const [selectedTicket, setSelectedTicket] = useState<JourneyTicket | null>(null)

  const closeSelectedTicket = useCallback(() => {
    setSelectedTicket(null)
    const basePath = pathname || '/menu/manteniment/preventius/fulls'
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (!params.has('ticketId')) return
    params.delete('ticketId')
    const nextQuery = params.toString()
    router.replace(nextQuery ? `${basePath}?${nextQuery}` : basePath, { scroll: false })
  }, [pathname, router, searchParams])

  const openTicket = useCallback(
    async (id: string, code?: string, ticketType: 'maquinaria' | 'deco' = 'maquinaria') => {
      const ticket = await resolveJourneyTicket(id, code, ticketType)
      if (ticket) setSelectedTicket(ticket)
    },
    []
  )

  useEffect(() => {
    if (!queryTicketId) return
    if (selectedTicket?.id === queryTicketId) return

    const existing = ticketItems.find((item) => item.id === queryTicketId)
    if (existing) {
      void openTicket(existing.id, existing.code, existing.ticketType)
      return
    }

    let cancelled = false
    const loadDirectTicket = async () => {
      const ticket = await fetchTicketById(queryTicketId)
      if (!cancelled && ticket) setSelectedTicket(ticket)
    }
    void loadDirectTicket()
    return () => {
      cancelled = true
    }
  }, [queryTicketId, selectedTicket?.id, ticketItems, openTicket])

  return { selectedTicket, openTicket, closeSelectedTicket, setSelectedTicket }
}

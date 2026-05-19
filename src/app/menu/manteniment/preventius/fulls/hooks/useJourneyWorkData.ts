'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJourneyTickets, fetchPlannedItems } from '../lib/api'
import {
  collectStatusOptions,
  collectWorkerOptions,
  filterItemsByDateRange,
  groupWorkItems,
} from '../lib/groupWorkItems'
import type { JourneyDateFilters, PreventiuPlannedItem, TicketJourneyItem } from '../lib/types'

type Params = {
  filters: JourneyDateFilters
  role: string
  userId: string
  canFilterByWorker: boolean
  refreshKey: number
}

export function useJourneyWorkData({ filters, role, userId, canFilterByWorker, refreshKey }: Params) {
  const [plannedItems, setPlannedItems] = useState<PreventiuPlannedItem[]>([])
  const [ticketItems, setTicketItems] = useState<TicketJourneyItem[]>([])
  const [kindFilter, setKindFilter] = useState<'all' | 'preventiu' | 'ticket'>('all')
  const [workerFilter, setWorkerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let active = true
    const load = async () => {
      const items = await fetchPlannedItems(filters.start, filters.end)
      if (active) setPlannedItems(items)
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [filters.start, filters.end, refreshKey])

  useEffect(() => {
    let active = true
    const load = async () => {
      const items = await fetchJourneyTickets(filters.start, filters.end, role, userId)
      if (active) setTicketItems(items)
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [filters.start, filters.end, role, userId, refreshKey])

  const filteredByDate = useMemo(
    () => filterItemsByDateRange(filters, plannedItems, ticketItems),
    [filters, plannedItems, ticketItems]
  )

  const workerOptions = useMemo(() => collectWorkerOptions(filteredByDate), [filteredByDate])
  const statusOptions = useMemo(() => collectStatusOptions(filteredByDate, role), [filteredByDate, role])

  const grouped = useMemo(
    () =>
      groupWorkItems({
        filters,
        plannedItems,
        ticketItems,
        kindFilter,
        workerFilter,
        statusFilter,
        canFilterByWorker,
        role,
      }),
    [
      filters,
      plannedItems,
      ticketItems,
      kindFilter,
      workerFilter,
      statusFilter,
      canFilterByWorker,
      role,
    ]
  )

  return {
    plannedItems,
    ticketItems,
    kindFilter,
    setKindFilter,
    workerFilter,
    setWorkerFilter,
    statusFilter,
    setStatusFilter,
    workerOptions,
    statusOptions,
    grouped,
  }
}

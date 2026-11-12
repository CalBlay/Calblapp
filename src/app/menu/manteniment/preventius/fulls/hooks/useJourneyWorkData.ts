'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchJourneyTickets, fetchPendingJourneyTickets, fetchPlannedItems } from '../lib/api'
import {
  collectStatusOptions,
  collectWorkerOptions,
  filterItemsByDateRange,
  filterTicketsBeforeDateRange,
  filterTicketsOutsideDateRange,
  groupWorkItems,
} from '../lib/groupWorkItems'
import { normalizeMaintenanceStatus } from '../lib/status'
import type { JourneyDateFilters, PreventiuPlannedItem, TicketJourneyItem, WorkItem } from '../lib/types'

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
  const [pendingTicketItems, setPendingTicketItems] = useState<TicketJourneyItem[]>([])
  const [kindFilter, setKindFilter] = useState<'all' | 'preventiu' | 'ticket'>('all')
  const [workerFilter, setWorkerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

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

  useEffect(() => {
    let active = true
    const load = async () => {
      const items = await fetchPendingJourneyTickets(role, userId)
      if (active) setPendingTicketItems(items)
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [role, userId, refreshKey])

  const filteredByDate = useMemo(
    () => filterItemsByDateRange(filters, plannedItems, ticketItems),
    [filters, plannedItems, ticketItems]
  )

  const pendingFiltered = useMemo(() => {
    const workerNeedle = workerFilter.toLowerCase()
    const searchNeedle = searchQuery
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim()

    const pendingCandidates =
      role === 'treballador'
        ? filterTicketsBeforeDateRange(filters, pendingTicketItems)
        : filterTicketsOutsideDateRange(filters, pendingTicketItems)

    return pendingCandidates.filter((item) => {
      if (kindFilter === 'preventiu') return false
      const itemStatus = normalizeMaintenanceStatus(item.status)
      if (role !== 'treballador' && itemStatus !== 'espera') return false

      const matchesWorker =
        !canFilterByWorker || workerFilter === 'all'
          ? true
          : (item.worker || '')
              .split(',')
              .map((w) => w.trim().toLowerCase())
              .filter(Boolean)
              .includes(workerNeedle)

      const matchesStatus = statusFilter === 'all' ? true : itemStatus === statusFilter
      const haystack = [
        item.title,
        item.location,
        item.machine,
        item.worker,
        item.vehiclePlate,
        item.code,
      ]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
      const matchesSearch = !searchNeedle || haystack.includes(searchNeedle)

      return matchesWorker && matchesStatus && matchesSearch
    })
  }, [
    filters,
    pendingTicketItems,
    kindFilter,
    role,
    canFilterByWorker,
    workerFilter,
    statusFilter,
    searchQuery,
  ])

  const pendingGrouped = useMemo(
    () =>
      pendingFiltered
        .slice()
        .sort((a, b) => {
          const byDate = String(a.date || '').localeCompare(String(b.date || ''))
          if (byDate !== 0) return byDate
          const byStart = String(a.startTime || '').localeCompare(String(b.startTime || ''))
          if (byStart !== 0) return byStart
          return String(a.title || '').localeCompare(String(b.title || ''))
        })
        .reduce<Array<[string, WorkItem[]]>>((acc, item) => {
          const key = String(item.date || '')
          const existing = acc.find(([day]) => day === key)
          if (existing) {
            existing[1].push(item)
          } else {
            acc.push([key, [item]])
          }
          return acc
        }, []),
    [pendingFiltered]
  )

  const itemsForFilters = useMemo(() => {
    const seen = new Set<string>()
    const combined: WorkItem[] = []
    ;[...filteredByDate, ...pendingFiltered].forEach((item) => {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key)) return
      seen.add(key)
      combined.push(item)
    })
    return combined
  }, [filteredByDate, pendingFiltered])

  const workerOptions = useMemo(() => collectWorkerOptions(itemsForFilters), [itemsForFilters])
  const statusOptions = useMemo(() => collectStatusOptions(itemsForFilters, role), [itemsForFilters, role])

  const grouped = useMemo(
    () =>
      groupWorkItems({
        filters,
        plannedItems,
        ticketItems,
        kindFilter,
        workerFilter,
        statusFilter,
        searchQuery,
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
      searchQuery,
      canFilterByWorker,
      role,
    ]
  )

  return {
    plannedItems,
    ticketItems,
    pendingTicketItems,
    kindFilter,
    setKindFilter,
    workerFilter,
    setWorkerFilter,
    statusFilter,
    setStatusFilter,
    searchQuery,
    setSearchQuery,
    workerOptions,
    statusOptions,
    grouped,
    pendingGrouped,
  }
}

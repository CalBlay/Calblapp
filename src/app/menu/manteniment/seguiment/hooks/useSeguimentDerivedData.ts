'use client'

import { useCallback, useMemo } from 'react'
import { format } from 'date-fns'
import type { MachineItem, Ticket } from '@/app/menu/manteniment/tickets/types'
import type { MaintenanceStatus, Preventiu, SeguimentRow, TabKey } from '../types'
import {
  getDaysOpen,
  getPlannedMinutes,
  getTrackedMinutes,
  getTicketTrackedMinutes,
  normalizeStatus,
  parseDate,
  parseDateFromParts,
  STATUSES,
} from '../utils'

type Params = {
  tab: TabKey
  tickets: Ticket[]
  preventius: Preventiu[]
  machines: MachineItem[]
  dateMode: 'all' | 'planned'
  dateRange: { start: string; end: string }
  statusFilter: MaintenanceStatus[]
  workerFilter: string
  locationFilter: string
  externalFilter: 'all' | 'internal' | 'external'
  pendingValidationOnly: boolean
  stalledOnly: boolean
  search: string
  applyDateMatch: (plannedStart: number | string | null) => boolean
}

export function useSeguimentDerivedData({
  tab,
  tickets,
  preventius,
  machines,
  statusFilter,
  workerFilter,
  locationFilter,
  externalFilter,
  pendingValidationOnly,
  stalledOnly,
  search,
  applyDateMatch,
}: Params) {
  const normalizedSearch = search.trim().toLowerCase()
  const hasStatusFilter = statusFilter.length > 0

  const ticketRows = useMemo(
    () =>
      tickets
        .filter((ticket) => {
          if (hasStatusFilter && !statusFilter.includes(normalizeStatus(ticket.status))) return false
          if (externalFilter === 'external' && !ticket.externalized) return false
          if (externalFilter === 'internal' && ticket.externalized) return false
          if (workerFilter !== 'all' && !(ticket.assignedToNames || []).includes(workerFilter)) {
            return false
          }
          if (locationFilter !== 'all' && ticket.location !== locationFilter) return false
          if (pendingValidationOnly && normalizeStatus(ticket.status) !== 'fet') return false
          if (stalledOnly && (getDaysOpen(ticket.createdAt) || 0) < 3) return false
          if (
            normalizedSearch &&
            ![
              ticket.ticketCode,
              ticket.incidentNumber,
              ticket.description,
              ticket.machine,
              ticket.location,
              ...(ticket.assignedToNames || []),
              ticket.supplierName,
            ]
              .join(' ')
              .toLowerCase()
              .includes(normalizedSearch)
          ) {
            return false
          }
          return applyDateMatch(ticket.plannedStart || null)
        })
        .sort((a, b) => {
          const aTime =
            parseDate(
              (a.statusHistory || [])
                .slice()
                .sort((x, y) => Number(y.at || 0) - Number(x.at || 0))[0]?.at || a.createdAt
            )?.getTime() || 0
          const bTime =
            parseDate(
              (b.statusHistory || [])
                .slice()
                .sort((x, y) => Number(y.at || 0) - Number(x.at || 0))[0]?.at || b.createdAt
            )?.getTime() || 0
          return bTime - aTime
        }),
    [
      applyDateMatch,
      externalFilter,
      hasStatusFilter,
      locationFilter,
      normalizedSearch,
      pendingValidationOnly,
      stalledOnly,
      statusFilter,
      tickets,
      workerFilter,
    ]
  )

  const preventiuRows = useMemo(
    () =>
      preventius
        .filter((item) => {
          if (hasStatusFilter && !statusFilter.includes(item.status)) return false
          if (workerFilter !== 'all' && !item.workerNames.includes(workerFilter)) return false
          if (locationFilter !== 'all' && item.location !== locationFilter) return false
          if (pendingValidationOnly && item.status !== 'fet') return false
          if (stalledOnly && (getDaysOpen(item.createdAt) || 0) < 3) return false
          if (
            normalizedSearch &&
            ![item.title, item.location, ...item.workerNames]
              .join(' ')
              .toLowerCase()
              .includes(normalizedSearch)
          ) {
            return false
          }
          return applyDateMatch(parseDateFromParts(item.plannedDate, item.plannedStart)?.getTime() || null)
        })
        .sort(
          (a, b) =>
            (parseDate(b.updatedAt || b.createdAt)?.getTime() || 0) -
            (parseDate(a.updatedAt || a.createdAt)?.getTime() || 0)
        ),
    [
      applyDateMatch,
      hasStatusFilter,
      locationFilter,
      normalizedSearch,
      pendingValidationOnly,
      preventius,
      stalledOnly,
      statusFilter,
      workerFilter,
    ]
  )

  const currentRows = tab === 'tickets' ? ticketRows : preventiuRows

  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        STATUSES.map((status) => [
          status,
          currentRows.filter((row: SeguimentRow) => normalizeStatus(row.status) === status).length,
        ])
      ) as Record<MaintenanceStatus, number>,
    [currentRows]
  )

  const summaryStatuses = useMemo(() => STATUSES.filter((status) => status !== 'fet'), [])

  const pendingValidationCount = useMemo(
    () =>
      currentRows.filter((row: SeguimentRow) => normalizeStatus(row.status) === 'fet').length,
    [currentRows]
  )

  const averageDays = useMemo(
    () =>
      currentRows.length
        ? Math.round(
            currentRows.reduce(
              (sum: number, row: SeguimentRow) => sum + (getDaysOpen(row.createdAt) || 0),
              0
            ) / currentRows.length
          )
        : 0,
    [currentRows]
  )

  const totalTrackedMinutes = useMemo(
    () =>
      tab === 'tickets'
        ? ticketRows.reduce((sum, row) => sum + getTicketTrackedMinutes(row), 0)
        : preventiuRows.reduce((sum, row) => sum + getTrackedMinutes(row.history), 0),
    [preventiuRows, tab, ticketRows]
  )

  const totalPlannedMinutes = useMemo(
    () =>
      tab === 'tickets'
        ? ticketRows.reduce(
            (sum, row) =>
              sum +
              getPlannedMinutes(
                parseDate(row.plannedStart)
                  ? format(parseDate(row.plannedStart) as Date, 'HH:mm')
                  : null,
                parseDate(row.plannedEnd)
                  ? format(parseDate(row.plannedEnd) as Date, 'HH:mm')
                  : null,
                row.estimatedMinutes || null
              ),
            0
          )
        : preventiuRows.reduce(
            (sum, row) => sum + getPlannedMinutes(row.plannedStart, row.plannedEnd),
            0
          ),
    [preventiuRows, tab, ticketRows]
  )

  const machineNameMap = useMemo(
    () =>
      new Map(
        machines.map((machine) => [
          String(machine.code || '').trim(),
          String(machine.name || '').trim(),
        ])
      ),
    [machines]
  )

  const externalizedCount = useMemo(
    () => ticketRows.filter((row) => row.externalized).length,
    [ticketRows]
  )

  return {
    ticketRows,
    preventiuRows,
    currentRows,
    statusCounts,
    summaryStatuses,
    pendingValidationCount,
    averageDays,
    totalTrackedMinutes,
    totalPlannedMinutes,
    machineNameMap,
    externalizedCount,
  }
}

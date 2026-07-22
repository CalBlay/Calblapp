'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import type { MachineItem, Ticket } from '@/app/menu/manteniment/tickets/types'
import type { MaintenanceStatus, Preventiu, SeguimentRow, TabKey } from '../types'
import type { CenterRow } from '../../dades/types'
import {
  getDaysOpen,
  getTicketLastMovementAt,
  getPlannedMinutes,
  getTrackedMinutes,
  getTicketTrackedMinutes,
  normalizeStatus,
  parseDate,
  parseDateFromParts,
  STATUSES,
} from '../utils'
import { matchesMaintenanceSiteFilters } from '@/lib/maintenanceLocationCatalog'

function classifyTicketStatusForSeguimentSummary(ticket: Ticket): MaintenanceStatus | null {
  if (ticket.externalized) return null
  if (
    ticket.status === 'validat' ||
    ticket.workflowStage === 'resolved_admin' ||
    ticket.workflowStage === 'resolved_planner' ||
    ticket.workflowStage === 'closed'
  ) {
    return 'validat'
  }
  if (ticket.status === 'fet') return 'fet'
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'espera'
  ) {
    return 'espera'
  }
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'en_curs'
  ) {
    return 'en_curs'
  }
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'assignat'
  ) {
    return 'assignat'
  }
  if (
    (ticket.workflowStage || 'tickets_inbox') === 'tickets_inbox' &&
    (
      ticket.status === 'nou' ||
      ticket.status === 'no_fet' ||
      ticket.status === 'reassignat' ||
      ticket.status === 'assignat'
    )
  ) {
    return normalizeStatus(ticket.status)
  }
  return normalizeStatus(ticket.status)
}

type Params = {
  tab: TabKey
  tickets: Ticket[]
  preventius: Preventiu[]
  centers: CenterRow[]
  machines: MachineItem[]
  dateMode: 'all' | 'planned'
  dateRange: { start: string; end: string }
  statusFilter: MaintenanceStatus[]
  workerFilter: string
  centerFilter: string
  locationFilter: string
  zoneFilter: string
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
  centers,
  machines,
  statusFilter,
  workerFilter,
  centerFilter,
  locationFilter,
  zoneFilter,
  externalFilter,
  pendingValidationOnly,
  stalledOnly,
  search,
  applyDateMatch,
}: Params) {
  const normalizedSearch = search.trim().toLowerCase()
  const hasStatusFilter = statusFilter.length > 0
  const matchesTicketBaseFilters = (ticket: Ticket) => {
    if (workerFilter !== 'all' && !(ticket.assignedToNames || []).includes(workerFilter)) {
      return false
    }
    if (
      !matchesMaintenanceSiteFilters(
        centers,
        {
          center: centerFilter !== 'all' ? centerFilter : '',
          location: locationFilter !== 'all' ? locationFilter : '',
          zone: zoneFilter !== 'all' ? zoneFilter : '',
        },
        ticket.workLocation,
        ticket.location
      )
    ) {
      return false
    }
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
    return applyDateMatch(getTicketLastMovementAt(ticket))
  }

  const matchesPreventiuBaseFilters = (item: Preventiu) => {
    if (workerFilter !== 'all' && !item.workerNames.includes(workerFilter)) return false
    if (
      !matchesMaintenanceSiteFilters(
        centers,
        {
          center: centerFilter !== 'all' ? centerFilter : '',
          location: locationFilter !== 'all' ? locationFilter : '',
          zone: zoneFilter !== 'all' ? zoneFilter : '',
        },
        item.location
      )
    ) {
      return false
    }
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
  }

  const statusUniverseTicketRows = useMemo(
    () =>
      tickets
        .filter(matchesTicketBaseFilters)
        .sort((a, b) => {
          const aTime = parseDate(getTicketLastMovementAt(a))?.getTime() || 0
          const bTime = parseDate(getTicketLastMovementAt(b))?.getTime() || 0
          return bTime - aTime
        }),
    [applyDateMatch, centerFilter, centers, locationFilter, normalizedSearch, stalledOnly, tickets, workerFilter, zoneFilter]
  )

  const statusUniversePreventiuRows = useMemo(
    () =>
      preventius
        .filter(matchesPreventiuBaseFilters)
        .sort(
          (a, b) =>
            (parseDate(b.updatedAt || b.createdAt)?.getTime() || 0) -
            (parseDate(a.updatedAt || a.createdAt)?.getTime() || 0)
        ),
    [applyDateMatch, centerFilter, centers, locationFilter, normalizedSearch, preventius, stalledOnly, workerFilter, zoneFilter]
  )

  const ticketRows = useMemo(
    () =>
      statusUniverseTicketRows
        .filter((ticket) => {
          if (externalFilter === 'external' && !ticket.externalized) return false
          if (externalFilter === 'internal' && ticket.externalized) return false
          const classifiedStatus = classifyTicketStatusForSeguimentSummary(ticket)
          if (
            externalFilter !== 'external' &&
            hasStatusFilter &&
            (!classifiedStatus || !statusFilter.includes(classifiedStatus))
          ) {
            return false
          }
          if (pendingValidationOnly && normalizeStatus(ticket.status) !== 'fet') return false
          return true
        })
        .sort((a, b) => {
          const aTime = parseDate(getTicketLastMovementAt(a))?.getTime() || 0
          const bTime = parseDate(getTicketLastMovementAt(b))?.getTime() || 0
          return bTime - aTime
        }),
    [
      externalFilter,
      hasStatusFilter,
      pendingValidationOnly,
      statusFilter,
      statusUniverseTicketRows,
    ]
  )

  const preventiuRows = useMemo(
    () =>
      statusUniversePreventiuRows
        .filter((item) => {
          if (hasStatusFilter && !statusFilter.includes(item.status)) return false
          if (pendingValidationOnly && item.status !== 'fet') return false
          return true
        })
        .sort(
          (a, b) =>
            (parseDate(b.updatedAt || b.createdAt)?.getTime() || 0) -
            (parseDate(a.updatedAt || a.createdAt)?.getTime() || 0)
        ),
    [
      hasStatusFilter,
      pendingValidationOnly,
      statusFilter,
      statusUniversePreventiuRows,
    ]
  )

  const currentRows = tab === 'tickets' ? ticketRows : preventiuRows
  const statusUniverseRows = tab === 'tickets' ? statusUniverseTicketRows : statusUniversePreventiuRows

  const statusCounts = useMemo(
    () =>
      Object.fromEntries(
        STATUSES.map((status) => [
          status,
          statusUniverseRows.filter((row: SeguimentRow) => {
            if (tab === 'tickets') {
              return classifyTicketStatusForSeguimentSummary(row as Ticket) === status
            }
            return normalizeStatus(row.status) === status
          }).length,
        ])
      ) as Record<MaintenanceStatus, number>,
    [statusUniverseRows, tab]
  )

  const summaryStatuses = useMemo(() => STATUSES.filter((status) => status !== 'fet'), [])

  const pendingValidationCount = useMemo(
    () =>
      statusUniverseRows.filter((row: SeguimentRow) => {
        if (tab === 'tickets') {
          return classifyTicketStatusForSeguimentSummary(row as Ticket) === 'fet'
        }
        return normalizeStatus(row.status) === 'fet'
      }).length,
    [statusUniverseRows, tab]
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
    () => statusUniverseTicketRows.filter((row) => row.externalized).length,
    [statusUniverseTicketRows]
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

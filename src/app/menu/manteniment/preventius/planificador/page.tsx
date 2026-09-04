'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ca } from 'date-fns/locale'
import { AlertTriangle, ChevronDown, ChevronUp, Search, Ticket, X } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import MaintenanceToolbar from '@/app/menu/manteniment/components/MaintenanceToolbar'
import { typography } from '@/lib/typography'
import { MAINTENANCE_TICKETS_MANAGE_PERM } from '@/lib/maintenanceTicketsPermissions'
import {
  getMaintenanceCenterOptions,
  getMaintenanceLocationsForCenter,
  getMaintenanceZones,
  matchesMaintenanceSiteFilters,
} from '@/lib/maintenanceLocationCatalog'
import type { DueTemplate, PlannerDraft, ScheduledItem, TicketCard } from './types'
import {
  PRIORITY_LABEL,
  getInitials,
  getPriorityTone,
  getWorkerBadgeClass,
  isPreventiuScheduledInWeek,
  minutesFromTime,
  normalizeName,
  timeFromMinutes,
} from './utils'
import PlannerSidebar from './components/PlannerSidebar'
import PlannerEditModal from './components/PlannerEditModal'
import PlannerTicketModal from './components/PlannerTicketModal'
import usePlannerData from './usePlannerData'
import {
  DECO_PLANNER_UI_PATH,
  DECO_TICKETS_MANAGE_PERM,
  DECO_TICKETS_UI_PATH,
} from '@/lib/decoTicketsPermissions'

const ROW_HEIGHT = 40
const GRID_GAP = 1
const HEADER_HEIGHT = 32
const TIME_COL_WIDTH = 80
const DAY_COUNT = 6
const MONTH_DAY_COUNT = 7
type PlannerTypeFilter = 'preventius' | 'tickets' | 'externalized'

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const asNumber = Number(trimmed)
    if (Number.isFinite(asNumber)) {
      return asNumber < 1e12 ? asNumber * 1000 : asNumber
    }
    const parsed = new Date(trimmed).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value && typeof value === 'object') {
    const dateLike = value as {
      toDate?: () => Date
      seconds?: number
      nanoseconds?: number
      _seconds?: number
      _nanoseconds?: number
    }
    if (typeof dateLike.toDate === 'function') {
      const parsed = dateLike.toDate().getTime()
      return Number.isNaN(parsed) ? null : parsed
    }
    const seconds =
      typeof dateLike.seconds === 'number'
        ? dateLike.seconds
        : typeof dateLike._seconds === 'number'
          ? dateLike._seconds
          : null
    if (seconds !== null) {
      const nanos =
        typeof dateLike.nanoseconds === 'number'
          ? dateLike.nanoseconds
          : typeof dateLike._nanoseconds === 'number'
            ? dateLike._nanoseconds
            : 0
      return seconds * 1000 + Math.floor(nanos / 1_000_000)
    }
  }
  return null
}

function isExternalizedLike(ticket?: {
  externalized?: boolean | null
  workflowStage?: string | null
  externalSentAt?: unknown
  supplierName?: string | null
  supplierEmail?: string | null
  externalizationHistory?: unknown[]
}) {
  if (!ticket) return false
  if (ticket.externalized) return true
  if (String(ticket.workflowStage || '').trim() === 'externalized') return true
  if (toMillis(ticket.externalSentAt)) return true
  if (String(ticket.supplierName || '').trim()) return true
  if (String(ticket.supplierEmail || '').trim()) return true
  return Array.isArray(ticket.externalizationHistory) && ticket.externalizationHistory.length > 0
}

const TICKET_STATUS_FILTER_STYLES: Record<
  'all' | 'nou' | 'assignat' | 'reassignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat',
  { active: string; dot: string; label: string }
> = {
  all: {
    active: 'bg-slate-900 text-white border-slate-900',
    dot: 'bg-slate-400',
    label: 'Tots els estats',
  },
  nou: {
    active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Nou',
  },
  assignat: {
    active: 'bg-sky-100 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
    label: 'Assignat',
  },
  reassignat: {
    active: 'bg-orange-100 text-orange-800 border-orange-200',
    dot: 'bg-orange-500',
    label: 'Reassignat',
  },
  en_curs: {
    active: 'bg-amber-100 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'En curs',
  },
  espera: {
    active: 'bg-slate-200 text-slate-800 border-slate-300',
    dot: 'bg-slate-500',
    label: 'Espera',
  },
  fet: {
    active: 'bg-green-100 text-green-800 border-green-200',
    dot: 'bg-green-500',
    label: 'Fet',
  },
  no_fet: {
    active: 'bg-rose-100 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
    label: 'No fet',
  },
  validat: {
    active: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: 'bg-violet-500',
    label: 'Validat',
  },
}

function normalizePlannerTicketStatus(value?: string | null) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'reassignat') return 'reassignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut') return 'fet'
  if (v === 'validat') return 'validat'
  return 'nou'
}

function getExternalizedPlannerStatusMeta(status?: string | null) {
  const normalized = normalizePlannerTicketStatus(status)
  return {
    label: TICKET_STATUS_FILTER_STYLES[normalized].label,
    className: TICKET_STATUS_FILTER_STYLES[normalized].active,
  }
}

const MAINTENANCE_TICKETS_PATH = '/menu/manteniment/tickets'

export default function PreventiusPlanificadorPage() {
  const pathname = usePathname() || ''
  const isDecoPlanner = pathname.startsWith(DECO_PLANNER_UI_PATH)
  const { isPathAllowed, hasAction } = useUiPermissions()
  const ticketsPath = isDecoPlanner ? DECO_TICKETS_UI_PATH : MAINTENANCE_TICKETS_PATH
  const canViewTickets = isPathAllowed(ticketsPath)
  const canManagePlannerTickets = hasAction(
    isDecoPlanner ? DECO_TICKETS_MANAGE_PERM : MAINTENANCE_TICKETS_MANAGE_PERM
  )
  const [filters, setFiltersState] = useState<FiltersState>(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    const end = endOfWeek(base, { weekStartsOn: 1 })
    return {
      start: format(base, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      mode: 'week',
    }
  })
  const [tab, setTab] = useState<'preventius' | 'tickets' | 'externalized'>(() =>
    isDecoPlanner ? 'tickets' : 'preventius'
  )
  const [plannerViewFilters, setPlannerViewFilters] = useState<PlannerTypeFilter[]>(() =>
    isDecoPlanner ? ['tickets'] : []
  )
  const [preventiusFilter, setPreventiusFilter] = useState<'due' | 'overdue' | null>(null)
  const [ticketsAgeFilter, setTicketsAgeFilter] = useState<
    'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus' | null
  >(null)
  const [ticketsStatusFilter, setTicketsStatusFilter] = useState<
    'all' | 'nou' | 'assignat' | 'reassignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat'
  >('all')
  const [showLegend, setShowLegend] = useState(false)
  const [showScheduledInSidebar, setShowScheduledInSidebar] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<PlannerDraft | null>(null)
  const [selectedMonthDayKey, setSelectedMonthDayKey] = useState<string | null>(null)
  const [plannerSearch, setPlannerSearch] = useState('')

  const togglePlannerViewFilter = (filter: PlannerTypeFilter) => {
    setPlannerViewFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    )
  }

  const handleTabChange = (nextTab: 'preventius' | 'tickets' | 'externalized') => {
    if (isDecoPlanner && nextTab === 'preventius') return
    setTab(nextTab)
    setShowScheduledInSidebar(false)
    if (!isMonthMode) {
      setPlannerViewFilters([nextTab])
    }
  }

  const setFilters = (partial: Partial<FiltersState>) =>
    setFiltersState((prev) => ({ ...prev, ...partial }))

  const isMonthMode = filters.mode === 'month'
  const rangeStart = useMemo(() => parseISO(filters.start), [filters.start])
  const rangeEnd = useMemo(() => parseISO(filters.end), [filters.end])
  const plannerStart = useMemo(
    () => (isMonthMode ? startOfWeek(rangeStart, { weekStartsOn: 1 }) : rangeStart),
    [isMonthMode, rangeStart]
  )
  const plannerDayCount = useMemo(
    () =>
      isMonthMode
        ? differenceInCalendarDays(endOfWeek(rangeEnd, { weekStartsOn: 1 }), plannerStart) + 1
        : DAY_COUNT,
    [isMonthMode, plannerStart, rangeEnd]
  )
  const weekLabel = format(rangeStart, "yyyy-'W'II")
  const monthLabel = format(startOfMonth(rangeStart), 'MMMM yyyy', { locale: ca }).replace(
    /^./,
    (char) => char.toUpperCase()
  )
  const selectedWorker = String(filters.responsable || '__all__')
  const days = useMemo(
    () => Array.from({ length: plannerDayCount }, (_, i) => addDays(plannerStart, i)),
    [plannerDayCount, plannerStart]
  )
  const daySidebarLabels = useMemo(
    () => days.map((d) => format(d, 'EEE dd/MM', { locale: ca })),
    [days]
  )
  const {
    centers,
    locations,
    machines,
    users,
    ticketById,
    externalizedTickets,
    scheduledItems,
    setScheduledItems,
    visibleItems,
    timeSlots,
    legendWorkers,
    loadWeekSchedule,
    getWorkerConflicts,
    availableWorkers,
    resolveWorkerIds,
    persistTicketPlanning,
  } = usePlannerData({
    canViewTickets,
    ticketType: isDecoPlanner ? 'deco' : 'maquinaria',
    weekStart: plannerStart,
    dayCount: plannerDayCount,
    tab,
    preventiusFilter,
    ticketsAgeFilter,
  })

  const workerOptions = useMemo(
    () =>
      Array.from(
        new Set(
          scheduledItems
            .flatMap((item) => item.workers || [])
            .map((worker) => String(worker || '').trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [scheduledItems]
  )

  const filterCenters = useMemo(() => getMaintenanceCenterOptions(centers), [centers])
  const filterLocations = useMemo(
    () =>
      getMaintenanceLocationsForCenter(
        centers,
        filters.center && filters.center !== '__all__' ? filters.center : ''
      ),
    [centers, filters.center]
  )
  const filterZones = useMemo(
    () =>
      getMaintenanceZones(
        centers,
        filters.center && filters.center !== '__all__' ? filters.center : '',
        filters.location && filters.location !== '__all__' ? filters.location : ''
      ),
    [centers, filters.center, filters.location]
  )

  const effectivePlannerViewFilters = useMemo<PlannerTypeFilter[]>(
    () =>
      isMonthMode
        ? [tab === 'externalized' ? 'externalized' : tab]
        : plannerViewFilters,
    [isMonthMode, plannerViewFilters, tab]
  )

  const filteredExternalizedTickets = useMemo(() => {
    if (tab !== 'tickets' && tab !== 'externalized') return []
    return externalizedTickets.filter((item) =>
      matchesMaintenanceSiteFilters(
        centers,
        {
          center: filters.center !== '__all__' ? filters.center : '',
          location: filters.location !== '__all__' ? filters.location : '',
          zone: filters.zone !== '__all__' ? filters.zone : '',
        },
        item.location
      )
    )
  }, [centers, externalizedTickets, filters.center, filters.location, filters.zone, tab])

  const filteredVisibleItems = useMemo(
    () =>
      visibleItems.filter((item) =>
        matchesMaintenanceSiteFilters(
          centers,
          {
            center: filters.center !== '__all__' ? filters.center : '',
            location: filters.location !== '__all__' ? filters.location : '',
            zone: filters.zone !== '__all__' ? filters.zone : '',
          },
          item.location
        )
      ),
    [centers, filters.center, filters.location, filters.zone, visibleItems]
  )

  const fallbackTicketScheduledItems = useMemo(() => {
    const entries = Object.entries(ticketById || {})
    if (entries.length === 0) return [] as ScheduledItem[]

    return entries
      .map(([ticketId, ticket]) => {
        const plannedStartMs = toMillis(ticket.plannedStart)
        const plannedEndMs = toMillis(ticket.plannedEnd)
        if (plannedStartMs && plannedEndMs) {
          const startDate = new Date(plannedStartMs)
          const endDate = new Date(plannedEndMs)
          const date = format(startDate, 'yyyy-MM-dd')
          const dayIndex = days.findIndex((day) => format(day, 'yyyy-MM-dd') === date)
          if (dayIndex < 0) return null
          const code = String(ticket.ticketCode || ticket.incidentNumber || ticketId)
          const title = String(
            ticket.operatorTitle ||
              ticket.description ||
              ticket.machine ||
              ticket.workLocation ||
              ticket.location ||
              code
          ).trim()
          const isExternal = isExternalizedLike(ticket)
          return {
            id: `fallback-ticket-${ticketId}`,
            kind: 'ticket' as const,
            title: `${code} - ${title}`.trim(),
            workers: Array.isArray(ticket.assignedToNames) ? ticket.assignedToNames.map(String) : [],
            workersCount: Array.isArray(ticket.assignedToNames) ? ticket.assignedToNames.length || 1 : 1,
            dayIndex,
            start: format(startDate, 'HH:mm'),
            end: format(endDate, 'HH:mm'),
            minutes: Math.max(30, Number(ticket.estimatedMinutes || 60)),
            priority: ticket.priority || 'normal',
            location: String(ticket.workLocation || ticket.location || ''),
            machine: String(ticket.machine || ''),
            createdAt: (ticket.createdAt as string | number | null) || null,
            templateId: null,
            ticketId,
            status: ticket.status,
            workflowStage: isExternal ? 'externalized' : String(ticket.workflowStage || 'planned_internal'),
          }
        }

        const isExternal = isExternalizedLike(ticket)
        if (isExternal) {
          const followUpAt = toMillis(ticket.externalSentAt) ?? toMillis(ticket.createdAt)
          if (!followUpAt) return null
          const followUpDate = new Date(followUpAt)
          const date = format(followUpDate, 'yyyy-MM-dd')
          const firstDay = format(days[0], 'yyyy-MM-dd')
          const lastDay = format(days[days.length - 1], 'yyyy-MM-dd')
          if (date < firstDay || date > lastDay) return null
          const dayIndex = days.findIndex((day) => format(day, 'yyyy-MM-dd') === date)
          if (dayIndex < 0) return null
          const startMinutes = Math.min(
            Math.max(followUpDate.getHours() * 60 + followUpDate.getMinutes(), 8 * 60),
            17 * 60 + 30
          )
          const endMinutes = Math.min(startMinutes + 30, 18 * 60)
          const code = String(ticket.ticketCode || ticket.incidentNumber || ticketId)
          const title = String(
            ticket.operatorTitle ||
              ticket.description ||
              ticket.machine ||
              ticket.workLocation ||
              ticket.location ||
              code
          ).trim()
          return {
            id: `fallback-externalized-${ticketId}`,
            kind: 'ticket' as const,
            title: `${code} - ${title}`.trim(),
            workers: Array.isArray(ticket.assignedToNames) ? ticket.assignedToNames.map(String) : [],
            workersCount: Array.isArray(ticket.assignedToNames) ? ticket.assignedToNames.length || 1 : 1,
            dayIndex,
            start: timeFromMinutes(startMinutes),
            end: timeFromMinutes(endMinutes),
            minutes: Math.max(30, Number(ticket.estimatedMinutes || 30)),
            priority: ticket.priority || 'normal',
            location: String(ticket.workLocation || ticket.location || ''),
            machine: String(ticket.machine || ''),
            createdAt: (ticket.externalSentAt as string | number | null) || ticket.createdAt || null,
            templateId: null,
            ticketId,
            status: ticket.status,
            workflowStage: 'externalized',
          }
        }

        return null
      })
      .filter(Boolean) as ScheduledItem[]
  }, [days, ticketById])

  const mergedScheduledItems = useMemo(() => {
    const byTicketId = new Set(
      scheduledItems
        .filter((item) => item.kind === 'ticket')
        .map((item) => String(item.ticketId || item.id || ''))
        .filter(Boolean)
    )
    const ticketFallbacks = fallbackTicketScheduledItems.filter(
      (item) => !byTicketId.has(String(item.ticketId || item.id || ''))
    )
    return [...scheduledItems, ...ticketFallbacks]
  }, [fallbackTicketScheduledItems, scheduledItems])

  const hasPlannerTypeFilter = effectivePlannerViewFilters.length > 0
  const showsTicketContent =
    tab === 'tickets' ||
    tab === 'externalized' ||
    effectivePlannerViewFilters.includes('tickets') ||
    effectivePlannerViewFilters.includes('externalized')

  const kindFilteredScheduledItems = useMemo(() => {
    if (!hasPlannerTypeFilter) return mergedScheduledItems
    return mergedScheduledItems.filter((item) => {
      const isExternalizedTicket = item.kind === 'ticket' && item.workflowStage === 'externalized'
      const matchesPreventius =
        effectivePlannerViewFilters.includes('preventius') && item.kind === 'preventiu'
      const matchesTickets =
        effectivePlannerViewFilters.includes('tickets') &&
        item.kind === 'ticket' &&
        !isExternalizedTicket
      const matchesExternalized =
        effectivePlannerViewFilters.includes('externalized') && isExternalizedTicket
      return matchesPreventius || matchesTickets || matchesExternalized
    })
  }, [effectivePlannerViewFilters, hasPlannerTypeFilter, mergedScheduledItems])

  const ticketStatusFilteredScheduledItems = useMemo(() => {
    if (!showsTicketContent || ticketsStatusFilter === 'all') return kindFilteredScheduledItems
    return kindFilteredScheduledItems.filter((item) => {
      if (item.kind !== 'ticket') return true
      return normalizePlannerTicketStatus(item.status) === ticketsStatusFilter
    })
  }, [kindFilteredScheduledItems, showsTicketContent, ticketsStatusFilter])

  const filteredScheduledItems = useMemo(() => {
    const siteFiltered = ticketStatusFilteredScheduledItems.filter((item) =>
      matchesMaintenanceSiteFilters(
        centers,
        {
          center: filters.center !== '__all__' ? filters.center : '',
          location: filters.location !== '__all__' ? filters.location : '',
          zone: filters.zone !== '__all__' ? filters.zone : '',
        },
        item.location
      )
    )
    if (!selectedWorker || selectedWorker === '__all__') return siteFiltered
    const normalizedSelected = normalizeName(selectedWorker)
    return siteFiltered.filter((item) =>
      item.workers.some((worker) => normalizeName(worker) === normalizedSelected)
    )
  }, [
    centers,
    filters.center,
    filters.location,
    filters.zone,
    selectedWorker,
    ticketStatusFilteredScheduledItems,
  ])

  const normalizedPlannerSearch = useMemo(() => normalizeName(plannerSearch), [plannerSearch])

  const searchMatchedScheduledItems = useMemo(() => {
    if (!normalizedPlannerSearch) return []
    return filteredScheduledItems
      .filter((item) => {
        const haystack = [
          item.title,
          item.location,
          item.machine,
          item.workers.join(' '),
          item.ticketId,
          item.templateId,
        ]
          .map((value) => normalizeName(String(value || '')))
          .join(' ')
        return haystack.includes(normalizedPlannerSearch)
      })
      .sort((a, b) => {
        const aExact = normalizeName(a.title).startsWith(normalizedPlannerSearch) ? 1 : 0
        const bExact = normalizeName(b.title).startsWith(normalizedPlannerSearch) ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex
        return minutesFromTime(a.start) - minutesFromTime(b.start)
      })
  }, [filteredScheduledItems, normalizedPlannerSearch])

  const calendarScheduledItems = useMemo(
    () => (normalizedPlannerSearch ? searchMatchedScheduledItems : filteredScheduledItems),
    [filteredScheduledItems, normalizedPlannerSearch, searchMatchedScheduledItems]
  )

  const plannerSearchResults = useMemo(
    () =>
      searchMatchedScheduledItems.slice(0, 8).map((item) => ({
        item,
        dateLabel:
          days[item.dayIndex] != null
            ? format(days[item.dayIndex], 'EEE dd/MM', { locale: ca })
            : `Dia ${item.dayIndex + 1}`,
      })),
    [days, searchMatchedScheduledItems]
  )

  const scheduledItemsByDay = useMemo(() => {
    const grouped = new Map<number, ScheduledItem[]>()
    calendarScheduledItems.forEach((item) => {
      const list = grouped.get(item.dayIndex) || []
      list.push(item)
      grouped.set(item.dayIndex, list)
    })
    grouped.forEach((list, dayIndex) => {
      grouped.set(
        dayIndex,
        [...list].sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))
      )
    })
    return grouped
  }, [calendarScheduledItems])

  const monthWeeks = useMemo(() => {
    if (!isMonthMode) return []
    return Array.from({ length: Math.ceil(days.length / MONTH_DAY_COUNT) }, (_, weekIndex) =>
      days.slice(weekIndex * MONTH_DAY_COUNT, weekIndex * MONTH_DAY_COUNT + MONTH_DAY_COUNT)
    )
  }, [days, isMonthMode])

  const selectedMonthDay = useMemo(() => {
    if (!selectedMonthDayKey) return null
    const dayIndex = days.findIndex((day) => format(day, 'yyyy-MM-dd') === selectedMonthDayKey)
    if (dayIndex < 0) return null
    return {
      date: days[dayIndex],
      dayIndex,
      items: scheduledItemsByDay.get(dayIndex) || [],
    }
  }, [days, scheduledItemsByDay, selectedMonthDayKey])

  const positionedScheduledItemsByDay = useMemo(() => {
    const grouped = new Map<
      number,
      Array<{ item: ScheduledItem; col: number; group: number; columns: number }>
    >()

    days.forEach((_, dayIndex) => {
      const dayItems = (scheduledItemsByDay.get(dayIndex) || []).map((item) => ({
        item,
        startMin: minutesFromTime(item.start),
        endMin: minutesFromTime(item.end),
      }))

      const positioned: Array<{ item: ScheduledItem; col: number; group: number }> = []
      let active: Array<{ endMin: number; col: number; group: number }> = []
      let groupId = 0

      dayItems.forEach((entry) => {
        active = active.filter((a) => a.endMin > entry.startMin)
        if (active.length === 0) groupId += 1
        const used = new Set(active.map((a) => a.col))
        let col = 0
        while (used.has(col)) col += 1
        active.push({ endMin: entry.endMin, col, group: groupId })
        positioned.push({ item: entry.item, col, group: groupId })
      })

      const groupMax: Record<number, number> = {}
      positioned.forEach((p) => {
        groupMax[p.group] = Math.max(groupMax[p.group] || 0, p.col + 1)
      })

      grouped.set(
        dayIndex,
        positioned.map((entry) => ({
          ...entry,
          columns: Math.max(1, groupMax[entry.group] || 1),
        }))
      )
    })

    return grouped
  }, [days, scheduledItemsByDay])

  const getRowIndex = (time: string) => {
    const [hh, mm] = time.split(':').map(Number)
    const minutesFromStart = (hh - 8) * 60 + mm
    return Math.max(0, Math.floor(minutesFromStart / 30))
  }

  const openModal = (next: typeof draft) => {
    setDraft(next)
    setIsModalOpen(true)
  }

  const handleDrop = async (dayIndex: number, startTime: string, data: string) => {
    try {
      const payload = JSON.parse(data) as
        | {
            type: 'card'
            kind: 'preventiu'
            templateId: string
            title: string
            minutes: number
            location?: string
            priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
          }
        | {
            type: 'card'
            kind: 'ticket'
            ticketId: string
            title: string
            minutes: number
            priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
            location?: string
            machine?: string
            createdAt?: string | number | null
          }
        | { type: 'scheduled'; id: string }

      if (payload.type === 'scheduled') {
        const target = scheduledItems.find((i) => i.id === payload.id)
        if (!target) return
        const duration = minutesFromTime(target.end) - minutesFromTime(target.start)
        const newStart = startTime
        const newEnd = timeFromMinutes(minutesFromTime(newStart) + Math.max(30, duration))
        if (target.dayIndex === dayIndex && target.start === newStart && target.end === newEnd) return

        const movedItem = {
          ...target,
          dayIndex,
          start: newStart,
          end: newEnd,
          minutes: Math.max(30, duration),
        }

        const workerConflicts = getWorkerConflicts(
          dayIndex,
          newStart,
          newEnd,
          movedItem.workers || [],
          target.id
        )
        if (workerConflicts.length > 0) {
          window.alert(
            `No es pot moure la fitxa aquí: ${workerConflicts.join(', ')} ${workerConflicts.length === 1 ? 'ja té' : 'ja tenen'} una altra feina en aquesta franja horària.`
          )
          return
        }

        setScheduledItems((prev) =>
          prev.map((item) => (item.id === target.id ? movedItem : item))
        )

        try {
          if (target.kind === 'ticket') {
            await persistTicketPlanning(movedItem)
          } else {
            const dateStr = format(addDays(plannerStart, dayIndex), 'yyyy-MM-dd')
            const workerNames = movedItem.workers || []
            const workerIds = resolveWorkerIds(workerNames)
            await fetch(`/api/maintenance/preventius/planned/${encodeURIComponent(target.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                templateId: movedItem.templateId || null,
                title: movedItem.title,
                date: dateStr,
                startTime: movedItem.start,
                endTime: movedItem.end,
                priority: movedItem.priority || 'normal',
                location: movedItem.location || '',
                workerNames,
                workerIds,
              }),
            })
          }
        } catch {
          await loadWeekSchedule()
        }
        return
      }

      if (payload.kind === 'ticket') {
        if (!canManagePlannerTickets) return
        const alreadyPlanned = scheduledItems.some(
          (i) => i.kind === 'ticket' && (i.ticketId || i.id) === payload.ticketId
        )
        if (alreadyPlanned) return
      } else {
        if (isPreventiuScheduledInWeek(payload.templateId, payload.title, scheduledItems)) return
      }

      const nextItem = {
        id:
          payload.kind === 'ticket'
            ? payload.ticketId
            : `temp-${payload.templateId}-${dayIndex}-${startTime}`,
        kind: payload.kind,
        templateId: payload.kind === 'preventiu' ? payload.templateId : null,
        ticketId: payload.kind === 'ticket' ? payload.ticketId : null,
        title: payload.title,
        createdAt: payload.kind === 'ticket' ? payload.createdAt || null : null,
        dayIndex,
        start: startTime,
        end: timeFromMinutes(minutesFromTime(startTime) + payload.minutes),
        minutes: payload.minutes,
        workersCount: 1,
        workers: [],
        priority: payload.priority || 'normal',
        location: payload.location || '',
        machine: payload.kind === 'ticket' ? payload.machine || '' : '',
      }

      if (payload.kind === 'ticket') {
        if (!canManagePlannerTickets) return
        setScheduledItems((prev) => [...prev.filter((item) => item.id !== nextItem.id), nextItem])
        try {
          await persistTicketPlanning(nextItem)
        } catch {
          await loadWeekSchedule()
        }
        return
      }

      setScheduledItems((prev) => [...prev, nextItem])
      try {
        const dateStr = format(addDays(plannerStart, dayIndex), 'yyyy-MM-dd')
        const res = await fetch('/api/maintenance/preventius/planned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: payload.templateId,
            title: payload.title,
            date: dateStr,
            startTime,
            endTime: nextItem.end,
            priority: payload.priority || 'normal',
            location: payload.location || '',
            workerNames: [],
            workerIds: [],
          }),
        })
        if (!res.ok) throw new Error('create_failed')
        const json = await res.json().catch(() => null)
        const savedId = json?.id ? String(json.id) : nextItem.id
        setScheduledItems((prev) =>
          prev.map((item) => (item.id === nextItem.id ? { ...item, id: savedId } : item))
        )
      } catch {
        await loadWeekSchedule()
      }
    } catch {
      return
    }
  }

  const handleEdit = (item: ScheduledItem) => {
    const duration = minutesFromTime(item.end) - minutesFromTime(item.start)
    openModal({
      id: item.id,
      kind: item.kind,
      source: 'scheduled',
      templateId: item.templateId || null,
      ticketId: item.ticketId || (item.kind === 'ticket' ? item.id : null),
      title: item.title,
      createdAt: item.createdAt || null,
      planDate: format(addDays(plannerStart, item.dayIndex), 'yyyy-MM-dd'),
      dayIndex: item.dayIndex,
      start: item.start,
      duration,
      end: item.end,
      workersCount: item.workersCount,
      workers: item.workers,
      priority: item.priority || 'normal',
      location: item.location || '',
      machine: item.machine || '',
      status: item.status,
      progress: item.progress,
    })
  }

  const handleCreateEmpty = (dayIndex: number, startTime: string) => {
    if (isDecoPlanner || tab !== 'preventius') return
    openModal({
      kind: 'preventiu',
      templateId: null,
      title: '',
      planDate: format(addDays(plannerStart, dayIndex), 'yyyy-MM-dd'),
      dayIndex,
      start: startTime,
      duration: 60,
      end: timeFromMinutes(minutesFromTime(startTime) + 60),
      workersCount: 1,
      workers: [],
      priority: 'normal',
      location: '',
      machine: '',
    })
  }

  const defaultDayIndex = useMemo(() => {
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const index = days.findIndex((day) => format(day, 'yyyy-MM-dd') === todayStr)
    return index >= 0 ? index : 0
  }, [days])

  const openPendingItem = (
    item:
      | {
          kind: 'preventiu'
          id: string
          title: string
          minutes: number
          location?: string
          priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
        }
      | {
          kind: 'ticket'
          id: string
          title: string
          minutes: number
          priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
          location?: string
          machine?: string
          createdAt?: string | number | null
        }
  ) => {
    openModal({
      kind: item.kind,
      source: 'pending',
      templateId: item.kind === 'preventiu' ? item.id : null,
      ticketId: item.kind === 'ticket' ? item.id : null,
      title: item.title,
      createdAt: item.kind === 'ticket' ? item.createdAt || null : null,
      planDate: format(days[defaultDayIndex], 'yyyy-MM-dd'),
      dayIndex: defaultDayIndex,
      start: '08:00',
      duration: item.minutes,
      end: timeFromMinutes(minutesFromTime('08:00') + item.minutes),
      workersCount: 1,
      workers: [],
      priority: item.priority || 'normal',
      location: item.location || '',
      machine: item.kind === 'ticket' ? item.machine || '' : '',
      status: item.kind === 'preventiu' ? 'assignat' : undefined,
    })
  }

  const handleReturnToPending = async (data: string) => {
    try {
      const payload = JSON.parse(data) as { type?: string; id?: string }
      if (payload.type !== 'scheduled' || !payload.id) return
      const target = scheduledItems.find((item) => item.id === payload.id)
      if (!target) return

      if (target.kind === 'preventiu') {
        const status = normalizePlannerTicketStatus(target.status)
        if (!['nou', 'assignat', 'reassignat', 'no_fet'].includes(status)) {
          window.alert('Només pots tornar a pendents preventius en estat Nou, Assignat o No fet.')
          await loadWeekSchedule()
          return
        }
      }

      setScheduledItems((prev) => prev.filter((item) => item.id !== target.id))

      if (target.kind === 'preventiu') {
        await unplanPreventiu(target.id, target.templateId)
      } else {
        if (!canManagePlannerTickets) {
          await loadWeekSchedule()
          return
        }
        const ticketId = target.ticketId || target.id
        const ok = await unplanTicket(ticketId, target.id)
        if (!ok) return
      }
    } catch {
      await loadWeekSchedule()
      return
    }
  }

  const unplanTicket = async (ticketId: string, scheduledId?: string) => {
    if (!canManagePlannerTickets) return false
    const current = ticketById[ticketId]
    const status = normalizePlannerTicketStatus(current?.status)

    if (!['nou', 'assignat', 'reassignat', 'no_fet'].includes(status)) {
      window.alert('Només pots tornar a pendents tickets en estat Nou, Assignat o No fet.')
      await loadWeekSchedule()
      return false
    }

    const nextStatus = status === 'no_fet' || status === 'reassignat' ? 'reassignat' : 'nou'
    const res = await fetch(`/api/maintenance/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
        workflowStage: 'planner_queue',
        plannedStart: null,
        plannedEnd: null,
        estimatedMinutes: null,
        assignedToIds: [],
        assignedToNames: [],
      }),
    })

    if (!res.ok) {
      if (scheduledId) {
        setScheduledItems((prev) => prev.filter((item) => item.id !== scheduledId))
      }
      throw new Error('ticket_unplan_failed')
    }

    await loadWeekSchedule()
    return true
  }

  const unplanPreventiu = async (plannedId: string, templateId?: string | null) => {
    if (templateId) {
      try {
        const templateRes = await fetch(
          `/api/maintenance/templates/${encodeURIComponent(templateId)}`,
          { cache: 'no-store' }
        )
        const templateJson = templateRes.ok ? await templateRes.json() : null
        const currentWeeks = Array.isArray(templateJson?.template?.autoPlanExcludedWeeks)
          ? templateJson.template.autoPlanExcludedWeeks.map(String)
          : []
        const nextWeeks = Array.from(new Set([...currentWeeks, weekLabel]))
        await fetch(`/api/maintenance/templates/${encodeURIComponent(templateId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoPlanExcludedWeeks: nextWeeks }),
        })
      } catch {
        // ignore exclusion update and still unplan
      }
    }

    await fetch(`/api/maintenance/preventius/planned/${plannedId}`, {
      method: 'DELETE',
    })
  }

  const renderMonthCellSummary = (dayIndex: number) => {
    const items = scheduledItemsByDay.get(dayIndex) || []
    const preventiusCount = items.filter((item) => item.kind === 'preventiu').length
    const externalizedCount = items.filter(
      (item) => item.kind === 'ticket' && item.workflowStage === 'externalized'
    ).length
    const ticketsCount = items.filter(
      (item) => item.kind === 'ticket' && item.workflowStage !== 'externalized'
    ).length
    const highlights = [...items]
      .sort((a, b) => {
        const weightA = a.priority ? (a.priority === 'urgent' ? 0 : a.priority === 'alta' ? 1 : a.priority === 'normal' ? 2 : 3) : 2
        const weightB = b.priority ? (b.priority === 'urgent' ? 0 : b.priority === 'alta' ? 1 : b.priority === 'normal' ? 2 : 3) : 2
        if (weightA !== weightB) return weightA - weightB
        return minutesFromTime(a.start) - minutesFromTime(b.start)
      })
      .slice(0, 2)

    return { items, preventiusCount, ticketsCount, externalizedCount, highlights }
  }

  return (
      <div className="w-full max-w-none mx-auto p-4 space-y-4">
        <ModuleHeader
          title={isDecoPlanner ? 'Imatge-Deco' : 'Manteniment'}
          subtitle="Planificador"
          mainHref={isDecoPlanner ? '/menu/deco' : '/menu/manteniment'}
          actions={
            canViewTickets ? (
              <Link
                href={ticketsPath}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
              >
                <Ticket className="h-4 w-4" />
                Tickets
              </Link>
            ) : undefined
          }
        />

        <FiltersBar
          filters={filters}
          setFilters={setFilters}
          responsables={workerOptions}
          centers={filterCenters}
          locations={filterLocations}
          zones={filterZones}
          visibleFilters={[]}
          modeDefault={isMonthMode ? 'month' : 'week'}
          modeOptions={['week', 'month']}
        />

        <div className="rounded-2xl border bg-white p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="relative w-full max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={plannerSearch}
                onChange={(e) => setPlannerSearch(e.target.value)}
                placeholder={
                  isDecoPlanner
                    ? 'Buscar codi, ticket o ubicació...'
                    : 'Buscar codi, ticket, preventiu, ubicacio o maquina...'
                }
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-800 outline-none transition focus:border-slate-400"
              />
              {plannerSearch.trim() ? (
                <button
                  type="button"
                  onClick={() => setPlannerSearch('')}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Netejar cerca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="text-xs text-slate-500 lg:pt-3">
              {normalizedPlannerSearch
                ? `${searchMatchedScheduledItems.length} coincidencies al planificador del periode actual`
                : 'Cerca transversal dins la graella actual, sense dependre de pestanya ni estat'}
            </div>
          </div>

          {normalizedPlannerSearch ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
              {plannerSearchResults.length === 0 ? (
                <div className="px-3 py-2 text-sm text-slate-500">
                  No hi ha cap coincidencia dins el periode carregat al planificador.
                </div>
              ) : (
                <div className="space-y-2">
                  {plannerSearchResults.map(({ item, dateLabel }) => (
                    <button
                      key={`search-${item.id}`}
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="flex w-full flex-col gap-1 rounded-xl border border-white bg-white px-3 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {item.title}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {item.location || item.machine || (item.kind === 'ticket' ? 'Ticket' : 'Preventiu')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <span className="rounded-full bg-slate-100 px-2 py-1">{dateLabel}</span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
                          {item.start} - {item.end}
                        </span>
                      </div>
                    </button>
                  ))}
                  {searchMatchedScheduledItems.length > plannerSearchResults.length ? (
                    <div className="px-3 pt-1 text-xs text-slate-500">
                      Mostrant les primeres {plannerSearchResults.length} coincidencies.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {isMonthMode ? (
          <div className="space-y-3">
            <MaintenanceToolbar
              leftSlot={
                <div className="flex flex-wrap items-center gap-2">
                  {!isDecoPlanner ? (
                    <button
                      type="button"
                      onClick={() => handleTabChange('preventius')}
                      className={[
                        'rounded-full px-4 py-2 text-xs font-semibold border',
                        tab === 'preventius'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-gray-700 border-gray-200',
                      ].join(' ')}
                    >
                      Preventius
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleTabChange('tickets')}
                    className={[
                      'rounded-full px-4 py-2 text-xs font-semibold border',
                      tab === 'tickets'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200',
                    ].join(' ')}
                  >
                    Tickets
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('externalized')}
                    className={[
                      'rounded-full px-4 py-2 text-xs font-semibold border',
                      tab === 'externalized'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white text-gray-700 border-gray-200',
                    ].join(' ')}
                  >
                    Externalitzats
                  </button>
                </div>
              }
              rightSlot={<div className="text-xs font-semibold text-slate-500">Vista mensual · {monthLabel}</div>}
            />
            <div className="overflow-auto rounded-2xl border bg-white p-3">
              <div className="min-w-[980px]">
                <div className="grid grid-cols-7 gap-px rounded-2xl bg-slate-200 overflow-hidden">
                  {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((label) => (
                    <div
                      key={label}
                      className="bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {label}
                    </div>
                  ))}

                  {monthWeeks.flatMap((week) =>
                    week.map((day) => {
                      const dayKey = format(day, 'yyyy-MM-dd')
                      const dayIndex = days.findIndex((item) => format(item, 'yyyy-MM-dd') === dayKey)
                      const summary = renderMonthCellSummary(dayIndex)
                      const isCurrentMonth = isSameMonth(day, rangeStart)
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() => setSelectedMonthDayKey(dayKey)}
                          className={[
                            'min-h-[138px] bg-white px-3 py-2 text-left align-top transition hover:bg-slate-50',
                            !isCurrentMonth ? 'bg-slate-50/70 text-slate-400' : '',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={[
                                'inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                                isToday(day)
                                  ? 'bg-slate-900 text-white'
                                  : isCurrentMonth
                                    ? 'text-slate-900'
                                    : 'text-slate-400',
                              ].join(' ')}
                            >
                              {format(day, 'd')}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {summary.items.length} tasques
                            </span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            {summary.preventiusCount > 0 ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                P {summary.preventiusCount}
                              </span>
                            ) : null}
                            {summary.ticketsCount > 0 ? (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                                T {summary.ticketsCount}
                              </span>
                            ) : null}
                            {summary.externalizedCount > 0 ? (
                              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                                E {summary.externalizedCount}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 space-y-1">
                            {summary.highlights.map((item) => {
                              const priority = item.priority || 'normal'
                              const tone = getPriorityTone(item.kind, priority)
                              const externalStatusMeta =
                                item.kind === 'ticket' && item.workflowStage === 'externalized'
                                  ? getExternalizedPlannerStatusMeta(item.status)
                                  : null
                              const displayTitle =
                                item.kind === 'ticket'
                                  ? item.title.replace(/^[A-Z]{2,}\d+\s*-\s*/i, '').trim() || item.title
                                  : item.title
                              return (
                                <div
                                  key={item.id}
                                  className={`rounded-lg border px-2 py-1 text-[11px] ${tone.card}`}
                                >
                                  <div className="truncate font-semibold">{displayTitle}</div>
                                  {externalStatusMeta ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                      {item.location ? (
                                        <span className="inline-flex rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-700">
                                          {item.location}
                                        </span>
                                      ) : null}
                                      {String(item.supplierName || '').trim() ? (
                                        <span className="inline-flex rounded-full bg-violet-100/80 px-1.5 py-0.5 text-[9px] font-medium text-violet-900">
                                          {String(item.supplierName || '').trim()}
                                        </span>
                                      ) : null}
                                      <span
                                        className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${externalStatusMeta.className}`}
                                      >
                                        {externalStatusMeta.label}
                                      </span>
                                    </div>
                                  ) : null}
                                  <div className="mt-0.5 truncate text-[10px] text-slate-600">
                                    {item.start}
                                    {item.location ? ` · ${item.location}` : ''}
                                  </div>
                                </div>
                              )
                            })}
                            {summary.items.length > 2 ? (
                              <div className="text-[11px] font-semibold text-slate-500">
                                +{summary.items.length - 2} més
                              </div>
                            ) : null}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {selectedMonthDay ? (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
                <div className="w-full max-w-3xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 md:px-6">
                    <div>
                      <div className="text-lg font-semibold text-slate-900">
                        {format(selectedMonthDay.date, 'EEEE d MMMM', { locale: ca })}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {selectedMonthDay.items.length} tasques planificades
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedMonthDayKey(null)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600"
                    >
                      Tancar
                    </button>
                  </div>

                  <div className="max-h-[70vh] space-y-3 overflow-auto px-5 py-5 md:px-6">
                    {tab === 'preventius' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMonthDayKey(null)
                          handleCreateEmpty(selectedMonthDay.dayIndex, '08:00')
                        }}
                        className="min-h-[44px] rounded-full border px-4 text-sm font-medium"
                      >
                        Nova tasca
                      </button>
                    ) : null}

                    {selectedMonthDay.items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">
                        No hi ha tasques planificades aquest dia.
                      </div>
                    ) : (
                      selectedMonthDay.items.map((item) => {
                        const priority = item.priority || 'normal'
                        const tone = getPriorityTone(item.kind, priority)
                        const externalStatusMeta =
                          item.kind === 'ticket' && item.workflowStage === 'externalized'
                            ? getExternalizedPlannerStatusMeta(item.status)
                            : null
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setSelectedMonthDayKey(null)
                              handleEdit(item)
                            }}
                            className={`w-full rounded-2xl border px-4 py-3 text-left ${tone.card}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={typography('sectionTitle')}>{item.title}</div>
                                {externalStatusMeta ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {item.location ? (
                                      <span className="inline-flex rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-700">
                                        {item.location}
                                      </span>
                                    ) : null}
                                    {String(item.supplierName || '').trim() ? (
                                      <span className="inline-flex rounded-full bg-violet-100/80 px-2 py-1 text-[10px] font-medium text-violet-900">
                                        {String(item.supplierName || '').trim()}
                                      </span>
                                    ) : null}
                                    <span
                                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${externalStatusMeta.className}`}
                                    >
                                      {externalStatusMeta.label}
                                    </span>
                                  </div>
                                ) : null}
                                <div className={`mt-1 ${typography('bodySm')}`}>
                                  {item.start} - {item.end}
                                  {item.location ? ` · ${item.location}` : ''}
                                </div>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.pill}`}>
                                {PRIORITY_LABEL[priority]}
                              </span>
                            </div>
                            {item.workers.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.workers.map((worker) => (
                                  <span
                                    key={`${item.id}-${worker}`}
                                    className={[
                                      'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                                      getWorkerBadgeClass(worker),
                                    ].join(' ')}
                                  >
                                    {worker}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
        <div className="space-y-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className={typography('bodyXs')}>DL-DS · Jornada base 08:00-18:00</div>
            <div className={typography('bodyXs')}>Setmana: {weekLabel}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isDecoPlanner ? (
              <button
                type="button"
                onClick={() => handleTabChange('preventius')}
                className={[
                  'min-h-[44px] rounded-full px-4 text-sm font-semibold border',
                  tab === 'preventius'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-700 border-gray-200',
                ].join(' ')}
              >
                Preventius
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleTabChange('tickets')}
              className={[
                'min-h-[44px] rounded-full px-4 text-sm font-semibold border',
                tab === 'tickets'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('externalized')}
              className={[
                'min-h-[44px] rounded-full px-4 text-sm font-semibold border',
                tab === 'externalized'
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Externalitzats
            </button>
          </div>

          <PlannerSidebar
            tab={tab}
            visibleItems={
              (tab === 'preventius'
                ? (filteredVisibleItems as DueTemplate[])
                : (filteredVisibleItems as TicketCard[]))
            }
            externalizedItems={filteredExternalizedTickets}
            scheduledItems={filteredScheduledItems}
            dayLabels={daySidebarLabels}
            showScheduledInSidebar={showScheduledInSidebar}
            onShowScheduledInSidebarChange={setShowScheduledInSidebar}
            onOpenPendingItem={openPendingItem}
          />

          <div className="space-y-3">
            {days.map((day, dayIndex) => {
              const dayItems = scheduledItemsByDay.get(dayIndex) || []
              return (
                <div key={format(day, 'yyyy-MM-dd')} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={typography('sectionTitle')}>
                        {format(day, 'EEEE dd/MM', { locale: ca })}
                      </div>
                      <div className={typography('bodyXs')}>{dayItems.length} tasques</div>
                    </div>
                    {tab === 'preventius' && (
                      <button
                        type="button"
                        onClick={() => handleCreateEmpty(dayIndex, '08:00')}
                        className="min-h-[44px] rounded-full border px-4 text-sm font-medium"
                      >
                        Nova tasca
                      </button>
                    )}
                  </div>
                  <div className="mt-3 space-y-3">
                    {dayItems.length === 0 && (
                      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-gray-500">
                        No hi ha cap tasca planificada.
                      </div>
                    )}
                    {dayItems.map((item) => {
                      const priority: NonNullable<ScheduledItem['priority']> = item.priority || 'normal'
                      const tone = getPriorityTone(item.kind, priority)
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleEdit(item)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left ${tone.card}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={typography('sectionTitle')}>{item.title}</div>
                              <div className={`mt-1 ${typography('bodySm')}`}>
                                {item.start} - {item.end}
                                {item.location ? ` · ${item.location}` : ''}
                              </div>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.pill}`}>
                              {PRIORITY_LABEL[priority]}
                            </span>
                          </div>
                          {item.kind === 'ticket' &&
                          item.workflowStage === 'externalized' &&
                          String(item.supplierName || '').trim() ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                                {item.supplierName}
                              </span>
                            </div>
                          ) : item.workers.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.workers.map((worker) => (
                                <span
                                  key={`${item.id}-${worker}`}
                                  className={[
                                    'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
                                    getWorkerBadgeClass(worker),
                                  ].join(' ')}
                                >
                                  {worker}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="hidden lg:block space-y-3">
          <div className="flex items-center gap-2">
            {!isDecoPlanner ? (
              <button
                type="button"
                onClick={() => handleTabChange('preventius')}
                className={[
                  'rounded-full px-4 py-2 text-xs font-semibold border',
                  tab === 'preventius'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-700 border-gray-200',
                ].join(' ')}
              >
                Preventius
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleTabChange('tickets')}
              className={[
                'rounded-full px-4 py-2 text-xs font-semibold border',
                tab === 'tickets'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Tickets
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('externalized')}
              className={[
                'rounded-full px-4 py-2 text-xs font-semibold border',
                tab === 'externalized'
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Externalitzats
            </button>
            {tab === 'preventius' && (
              <>
                <button
                  type="button"
                  onClick={() => setPreventiusFilter((current) => (current === 'due' ? null : 'due'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    preventiusFilter === 'due'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Aquesta setmana
                </button>
                <button
                  type="button"
                  onClick={() => setPreventiusFilter((current) => (current === 'overdue' ? null : 'overdue'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    preventiusFilter === 'overdue'
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Atencio
                </button>
              </>
            )}
            {(tab === 'tickets' || tab === 'externalized') && (
              <>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter((current) => (current === 'today' ? null : 'today'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    ticketsAgeFilter === 'today'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Avui
                </button>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter((current) => (current === 'days_1_2' ? null : 'days_1_2'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    ticketsAgeFilter === 'days_1_2'
                      ? 'bg-sky-100 text-sky-800 border-sky-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  1-2 dies
                </button>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter((current) => (current === 'days_3_7' ? null : 'days_3_7'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    ticketsAgeFilter === 'days_3_7'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  3-7 dies
                </button>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter((current) => (current === 'days_8_plus' ? null : 'days_8_plus'))}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    ticketsAgeFilter === 'days_8_plus'
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  +7 dies
                </button>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {plannerViewFilters.includes('tickets') && (
                <>
                  <div className="mr-1 h-6 w-px bg-slate-200" />
                  {(['nou', 'assignat', 'reassignat', 'en_curs', 'espera', 'fet', 'no_fet', 'validat'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() =>
                        setTicketsStatusFilter((current) => (current === status ? 'all' : status))
                      }
                      className={[
                        'rounded-full px-3 py-2 text-xs font-semibold border inline-flex items-center gap-2',
                        ticketsStatusFilter === status
                          ? TICKET_STATUS_FILTER_STYLES[status].active
                          : 'bg-white text-gray-700 border-gray-200',
                      ].join(' ')}
                      title={`Mostrar tickets en estat ${TICKET_STATUS_FILTER_STYLES[status].label}`}
                    >
                      <span className={`h-2 w-2 rounded-full ${TICKET_STATUS_FILTER_STYLES[status].dot}`} />
                      {TICKET_STATUS_FILTER_STYLES[status].label}
                    </button>
                  ))}
                </>
              )}
              <div className="text-xs font-semibold text-gray-500">Calendari</div>
              {!isDecoPlanner ? (
                <button
                  type="button"
                  onClick={() => togglePlannerViewFilter('preventius')}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    plannerViewFilters.includes('preventius')
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Preventius
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => togglePlannerViewFilter('tickets')}
                className={[
                  'rounded-full px-3 py-2 text-xs font-semibold border',
                  plannerViewFilters.includes('tickets')
                    ? 'bg-sky-100 text-sky-800 border-sky-200'
                    : 'bg-white text-gray-700 border-gray-200',
                ].join(' ')}
              >
                Tickets
              </button>
              <button
                type="button"
                onClick={() => togglePlannerViewFilter('externalized')}
                className={[
                  'rounded-full px-3 py-2 text-xs font-semibold border',
                  plannerViewFilters.includes('externalized')
                    ? 'bg-violet-100 text-violet-800 border-violet-200'
                    : 'bg-white text-gray-700 border-gray-200',
                ].join(' ')}
              >
                Externalitzats
              </button>
              <button
                type="button"
                onClick={() => setShowLegend((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-gray-600"
              >
                {showLegend ? (
                  <>
                    Amagar llegenda <ChevronUp size={14} />
                  </>
                ) : (
                  <>
                    Mostrar llegenda <ChevronDown size={14} />
                  </>
                )}
              </button>
            </div>
          </div>

          {showLegend && (
            <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-semibold text-gray-900">Tipus</div>
                {!isDecoPlanner ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Preventiu
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                  Ticket
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="font-semibold text-gray-900">Urgencia</div>
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-800">
                  <AlertTriangle className="h-3 w-3" />
                  Urgent
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                  Alta
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                  Normal
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  Baixa
                </span>
              </div>
              {legendWorkers.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-gray-900">Treballadors</div>
                  {legendWorkers.map((worker) => (
                    <span key={worker} className="inline-flex items-center gap-1">
                      <span
                        className={[
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                          getWorkerBadgeClass(worker),
                        ].join(' ')}
                        title={worker}
                      >
                        {getInitials(worker)}
                      </span>
                      <span className="text-[11px] text-gray-600">{worker}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid h-[calc(100vh-250px)] min-h-[620px] grid-cols-[200px_1fr] gap-3">
              <PlannerSidebar
                tab={tab}
                visibleItems={
                  (tab === 'preventius'
                    ? (filteredVisibleItems as DueTemplate[])
                    : (filteredVisibleItems as TicketCard[]))
                }
                externalizedItems={filteredExternalizedTickets}
                scheduledItems={filteredScheduledItems}
                dayLabels={daySidebarLabels}
                showScheduledInSidebar={showScheduledInSidebar}
                onShowScheduledInSidebarChange={setShowScheduledInSidebar}
                desktop
                onOpenPendingItem={openPendingItem}
                onReturnToPending={(data) => {
                  void handleReturnToPending(data)
                }}
              />

            <div className="flex h-full min-h-0 flex-col rounded-2xl border bg-white p-3">
              <div className="relative min-h-0 flex-1 overflow-auto">
                <div
                  className="grid gap-px bg-gray-100 text-xs"
                  style={{
                    gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${DAY_COUNT}, minmax(160px, 1fr))`,
                    gridTemplateRows: `${HEADER_HEIGHT}px repeat(${timeSlots.length - 1}, ${ROW_HEIGHT}px) 24px`,
                  }}
                >
                  <div className="bg-white" />
                  {days.map((d, i) => (
                    <div key={i} className="bg-white px-2 py-2 font-semibold text-gray-700">
                      {format(d, 'EEE dd/MM', { locale: ca })}
                    </div>
                  ))}

                  {timeSlots.slice(0, -1).map((t, rowIdx) => (
                    <React.Fragment key={t}>
                      <div className="bg-white px-2 py-2 text-gray-500">{t}</div>
                      {days.map((_, colIdx) => (
                        <div
                          key={`${rowIdx}-${colIdx}`}
                          className="bg-white"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            const data = e.dataTransfer.getData('text/plain')
                            handleDrop(colIdx, t, data)
                          }}
                          onClick={() => handleCreateEmpty(colIdx, t)}
                        />
                      ))}
                    </React.Fragment>
                  ))}

                  <div className="bg-white px-2 py-1 text-gray-500">{timeSlots[timeSlots.length - 1]}</div>
                  {days.map((_, colIdx) => (
                    <div key={`footer-${colIdx}`} className="bg-white" />
                  ))}
                </div>

                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${DAY_COUNT}, minmax(160px, 1fr))`,
                    gridTemplateRows: `${HEADER_HEIGHT}px repeat(${timeSlots.length - 1}, ${ROW_HEIGHT}px)`,
                    gap: `${GRID_GAP}px`,
                  }}
                >
                  <div />
                  {days.map((_, colIdx) => {
                    const positioned = positionedScheduledItemsByDay.get(colIdx) || []
                    const gapPx = 8

                    return (
                      <div
                        key={colIdx}
                        className="relative overflow-hidden"
                        style={{
                          gridColumn: `${colIdx + 2} / ${colIdx + 3}`,
                          gridRow: `2 / span ${timeSlots.length - 1}`,
                        }}
                      >
                        {positioned.map(({ item, col, columns }) => {
                          const rowStart = getRowIndex(item.start)
                          const rowEnd = getRowIndex(item.end)
                          const rows = Math.max(1, rowEnd - rowStart)
                          const height = rows * ROW_HEIGHT + Math.max(0, rows - 1) * GRID_GAP
                          const top = rowStart * (ROW_HEIGHT + GRID_GAP)
                          const widthPercent = 100 / columns
                          const leftPercent = col * widthPercent
                          const priority: NonNullable<ScheduledItem['priority']> =
                            item.priority || 'normal'
                          const tone = getPriorityTone(item.kind, priority)
                          const externalStatusMeta =
                            item.kind === 'ticket' && item.workflowStage === 'externalized'
                              ? getExternalizedPlannerStatusMeta(item.status)
                              : null
                          const visibleWorkers = item.workers.slice(0, 2)
                          const providerLabel =
                            item.kind === 'ticket' && item.workflowStage === 'externalized'
                              ? String(item.supplierName || '').trim()
                              : ''
                          const compactWorkers =
                            item.workers.length > 2 ||
                            visibleWorkers.reduce((total, worker) => total + worker.length, 0) > 12
                          const displayTitle =
                            item.kind === 'ticket'
                              ? item.title.replace(/^[A-Z]{2,}\d+\s*-\s*/i, '').trim() || item.title
                              : item.title
                          return (
                            <div
                              key={item.id}
                              className={`absolute border ${tone.card} rounded-lg pl-3 pr-2 py-1 text-[11px] text-gray-800 cursor-pointer pointer-events-auto overflow-hidden`}
                              style={{
                                top,
                                height,
                                width: `calc(${widthPercent}% - ${gapPx}px)`,
                                left: `calc(${leftPercent}% + ${gapPx / 2}px)`,
                                boxSizing: 'border-box',
                                maxWidth: '100%',
                              }}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData(
                                  'text/plain',
                                  JSON.stringify({ type: 'scheduled', id: item.id })
                                )
                              }}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => {
                                const data = e.dataTransfer.getData('text/plain')
                                handleDrop(item.dayIndex, item.start, data)
                              }}
                              onClick={() => handleEdit(item)}
                            >
                              <span className={`absolute left-0 top-0 h-full w-1 ${tone.marker}`} />
                              <div className="font-semibold leading-snug line-clamp-2">
                                {displayTitle}
                              </div>
                              {externalStatusMeta ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  {item.location ? (
                                    <span className="inline-flex items-center rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-700">
                                      {item.location}
                                    </span>
                                  ) : null}
                                  {providerLabel ? (
                                    <span
                                      className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-medium text-violet-900"
                                      title={providerLabel}
                                    >
                                      {providerLabel}
                                    </span>
                                  ) : null}
                                  <span
                                    className={`inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${externalStatusMeta.className}`}
                                  >
                                    {externalStatusMeta.label}
                                  </span>
                                </div>
                              ) : null}
                              {!externalStatusMeta && item.location && (
                                <div className="mt-1 line-clamp-1 text-[10px] text-gray-600">
                                  {item.location}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {!providerLabel ? (
                                  <>
                                    {visibleWorkers.map((worker) => (
                                      <span
                                        key={`${item.id}-${worker}`}
                                        className={[
                                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                          getWorkerBadgeClass(worker),
                                        ].join(' ')}
                                        title={worker}
                                      >
                                        {compactWorkers ? getInitials(worker) : worker}
                                      </span>
                                    ))}
                                    {item.workers.length > 2 && (
                                      <span
                                        className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                                        title={item.workers.join(', ')}
                                      >
                                        +{item.workers.length - 2}
                                      </span>
                                    )}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="mt-2 shrink-0 text-[11px] text-gray-500">
                Disponibilitat (només aquesta graella): un operari esta lliure si no te cap altra tasca
                solapada en la mateixa columna de dia i franja horaria.
              </div>
            </div>
          </div>
        </div>
          </>
        )}

        {isModalOpen && draft && draft.kind === 'ticket' && draft.ticketId && (
          <PlannerTicketModal
            ticketId={draft.ticketId}
            initialDate={draft.planDate || format(addDays(plannerStart, draft.dayIndex), 'yyyy-MM-dd')}
            initialStartTime={draft.start}
            initialDurationMinutes={draft.duration}
            initialTicket={ticketById[draft.ticketId] || null}
            locations={locations}
            machines={machines}
            users={users}
            weekStart={plannerStart}
            dayCount={plannerDayCount}
            availableWorkers={availableWorkers}
            deleteMode={draft.source === 'scheduled' ? 'unplan-ticket' : 'delete-ticket'}
            onDeletePlanned={async () => {
              const ticketId = draft.ticketId || draft.id
              if (!ticketId) return
              const ok = await unplanTicket(ticketId, draft.id)
              if (!ok) return
              setIsModalOpen(false)
              setDraft(null)
            }}
            onClose={() => {
              setIsModalOpen(false)
              setDraft(null)
            }}
            onRefresh={loadWeekSchedule}
          />
        )}

        {isModalOpen && draft && draft.kind !== 'ticket' && (
          <PlannerEditModal
            draft={draft}
            days={days}
            dayCount={plannerDayCount}
            machines={machines}
            users={users}
            getWorkerConflicts={getWorkerConflicts}
            availableWorkers={availableWorkers}
            minutesFromTime={minutesFromTime}
            timeFromMinutes={timeFromMinutes}
            setDraft={setDraft}
            setIsModalOpen={setIsModalOpen}
            setScheduledItems={setScheduledItems}
            resolveWorkerIds={resolveWorkerIds}
            weekStart={plannerStart}
            persistTicketPlanning={persistTicketPlanning}
            loadWeekSchedule={loadWeekSchedule}
            onUnplanPreventiu={unplanPreventiu}
            onUnplanTicket={unplanTicket}
          />
        )}
      </div>
  )
}

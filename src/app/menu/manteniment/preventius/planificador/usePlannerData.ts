'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import type { DueTemplate, ScheduledItem, Template, TicketCard } from './types'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import type { CenterRow } from '../../dades/types'
import { buildControlledMaintenanceLocations } from '@/lib/maintenanceLocationCatalog'
import {
  findAutoPlanSlot,
  findBestPreventiuSlot,
} from './autoPlanning'
import {
  PRIORITY_WEIGHT,
  calculateNextDue,
  getAgeBucket,
  getAgeDays,
  isPreventiuScheduledInWeek,
  isTicketScheduledInWeek,
  minutesFromTime,
  normalizeName,
  parseStoredDate,
  timeFromMinutes,
} from './utils'

type UsePlannerDataArgs = {
  canViewTickets: boolean
  ticketType?: 'maquinaria' | 'deco'
  weekStart: Date
  dayCount: number
  tab: 'preventius' | 'tickets' | 'externalized'
  preventiusFilter: 'due' | 'overdue' | null
  ticketsAgeFilter: 'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus' | null
}

type PlannerTicketLike = Partial<Ticket> & {
  id?: string | number
  externalized?: boolean
  status?: string
  ticketCode?: string
  incidentNumber?: string
  description?: string
  machine?: string
  location?: string
  estimatedMinutes?: number | string
  createdAt?: unknown
  plannedStart?: number | string
  plannedEnd?: number | string
  assignedToNames?: unknown[]
  priority?: TicketCard['priority']
  workflowStage?: string | null
  externalStatus?: TicketCard['externalStatus']
  externalSentAt?: number | string | null
}

type TemplateApiItem = {
  id?: string | number
  name?: string
  title?: string
  periodicity?: Template['periodicity']
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
  autoPlanExcludedWeeks?: unknown[]
}

type UserApiItem = {
  id?: string | number
  name?: string
  departmentLower?: string
  department?: string
}

type PlannedApiItem = {
  id?: string | number
  date?: string
  startTime?: string
  endTime?: string
  workerNames?: unknown[]
  title?: string
  priority?: ScheduledItem['priority']
  location?: string
  templateId?: string | null
  lastStatus?: string
  lastProgress?: number | string | null
}

function isPlannerExternalizedTicket(ticket: PlannerTicketLike) {
  if (Boolean(ticket.externalized)) return true
  if (String(ticket.workflowStage || '').trim() === 'externalized') return true
  if (toMillis(ticket.externalSentAt)) return true
  if (String(ticket.supplierName || '').trim()) return true
  if (String(ticket.supplierEmail || '').trim()) return true
  return (
    Array.isArray(ticket.externalizationHistory) && ticket.externalizationHistory.length > 0
  )
}

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

function normalizePlannerTicketStatus(value?: unknown) {
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

function mapPendingTickets(list: PlannerTicketLike[]) {
  return list
    .filter((t) => !isPlannerExternalizedTicket(t))
    .filter((t) => String(t.workflowStage || 'tickets_inbox') === 'planner_queue')
    .filter((t) => !t.plannedStart && !t.plannedEnd)
    .filter((t) => ['nou', 'no_fet', 'reassignat'].includes(normalizePlannerTicketStatus(t.status)))
    .map((t) => {
      const code = t.ticketCode || t.incidentNumber || 'TIC'
      const title = t.operatorTitle || t.description || t.machine || t.location || ''
      const minutes = Number(t.estimatedMinutes || 60)
      const ageDays = getAgeDays(t.createdAt)
      return {
        id: String(t.id || code),
        code,
        title,
        supplierName: String(t.supplierName || '').trim() || null,
        priority: (t.priority || 'normal') as TicketCard['priority'],
        minutes,
        status: normalizePlannerTicketStatus(t.status),
        workflowStage: String(t.workflowStage || 'planner_queue'),
        externalStatus: t.externalStatus || null,
        createdAt: t.createdAt || null,
        ageDays,
        ageBucket: getAgeBucket(ageDays),
        location: t.workLocation || t.location || '',
        machine: t.machine || '',
      }
    })
}

function mapExternalizedTickets(list: PlannerTicketLike[]) {
  return list
    .filter((t) => isPlannerExternalizedTicket(t))
    .map((t) => {
      const code = t.ticketCode || t.incidentNumber || 'TIC'
      const title = t.operatorTitle || t.description || t.machine || t.location || ''
      const minutes = Number(t.estimatedMinutes || 60)
      const followUpAt = t.externalSentAt || t.createdAt
      const ageDays = getAgeDays(followUpAt)
      return {
        id: String(t.id || code),
        code,
        title,
        supplierName: String(t.supplierName || '').trim() || null,
        priority: (t.priority || 'normal') as TicketCard['priority'],
        minutes,
        status: normalizePlannerTicketStatus(t.status),
        workflowStage: 'externalized',
        externalStatus: t.externalStatus || null,
        createdAt: t.createdAt || null,
        ageDays,
        ageBucket: getAgeBucket(ageDays),
        location: t.workLocation || t.location || '',
        machine: t.machine || '',
      }
    })
}

function mapExternalizedCalendarTickets(
  ticketList: PlannerTicketLike[],
  weekStart: Date,
  dayCount: number,
  startStr: string,
  endStr: string
) {
  return ticketList
    .filter((t) => isPlannerExternalizedTicket(t))
    .filter((t) => !t.plannedStart || !t.plannedEnd)
    .map((t) => {
      const followUpAt = toMillis(t.externalSentAt) ?? toMillis(t.createdAt)
      if (!followUpAt || followUpAt <= 0) return null
      const followUpDate = new Date(followUpAt)
      const date = format(followUpDate, 'yyyy-MM-dd')
      if (date < startStr || date > endStr) return null

      const dayIndex = Math.round((parseISO(date).getTime() - weekStart.getTime()) / 86400000)
      if (dayIndex < 0 || dayIndex >= dayCount) return null

      const minutesFromDay = followUpDate.getHours() * 60 + followUpDate.getMinutes()
      const startMinutes = Math.min(Math.max(minutesFromDay, 8 * 60), 17 * 60 + 30)
      const endMinutes = Math.min(startMinutes + 30, 18 * 60)
      const workers = Array.isArray(t.assignedToNames) ? t.assignedToNames.map(String) : []
      const title = String(t.operatorTitle || t.description || t.machine || t.workLocation || t.location || '')
      const code = String(t.ticketCode || t.incidentNumber || 'TIC')

      return {
        id: `externalized-${String(t.id || '')}`,
        kind: 'ticket' as const,
        title: `${code} - ${title}`.trim(),
        workers,
        supplierName: String(t.supplierName || '').trim() || null,
        workersCount: workers.length || 1,
        dayIndex,
        start: timeFromMinutes(startMinutes),
        end: timeFromMinutes(endMinutes),
        minutes: Math.max(30, Math.min(60, Number(t.estimatedMinutes || 30))),
        priority: (t.priority || 'normal') as ScheduledItem['priority'],
        location: String(t.workLocation || t.location || ''),
        machine: String(t.machine || ''),
        createdAt: t.createdAt || null,
        templateId: null,
        ticketId: String(t.id || ''),
        status: normalizePlannerTicketStatus(t.status),
        workflowStage: 'externalized',
      }
    })
    .filter(Boolean) as ScheduledItem[]
}

function buildTicketLookup(list: PlannerTicketLike[]) {
  return list.reduce((acc: Record<string, Ticket>, ticket) => {
    if (!ticket?.id) return acc
    acc[String(ticket.id)] = ticket as Ticket
    return acc
  }, {})
}

function mergeTicketLists(...lists: PlannerTicketLike[][]): PlannerTicketLike[] {
  const byId = new Map<string, PlannerTicketLike>()
  for (const list of lists) {
    for (const ticket of list) {
      const id = String(ticket.id || '')
      if (!id) continue
      byId.set(id, ticket)
    }
  }
  return Array.from(byId.values())
}

function mapPlannedTickets(
  ticketList: PlannerTicketLike[],
  weekStart: Date,
  dayCount: number,
  startStr: string,
  endStr: string
) {
  return ticketList
    .filter((t) => t.plannedStart && t.plannedEnd)
    .map((t) => {
      const startMs = toMillis(t.plannedStart)
      const endMs = toMillis(t.plannedEnd)
      if (!startMs || !endMs) return null
      const start = new Date(startMs)
      const end = new Date(endMs)
      const date = format(start, 'yyyy-MM-dd')
      if (date < startStr || date > endStr) return null
      const dayIndex = Math.round((parseISO(date).getTime() - weekStart.getTime()) / 86400000)
      if (dayIndex < 0 || dayIndex >= dayCount) return null
      const workers = Array.isArray(t.assignedToNames) ? t.assignedToNames.map(String) : []
      const title = String(t.operatorTitle || t.description || t.machine || t.workLocation || t.location || '')
      const code = String(t.ticketCode || t.incidentNumber || 'TIC')
      return {
        id: String(t.id || ''),
        kind: 'ticket' as const,
        title: `${code} - ${title}`.trim(),
        workers,
        supplierName: String(t.supplierName || '').trim() || null,
        workersCount: workers.length || 1,
        dayIndex,
        start: format(start, 'HH:mm'),
        end: format(end, 'HH:mm'),
        minutes: Math.max(30, Number(t.estimatedMinutes || 60)),
        priority: (t.priority || 'normal') as ScheduledItem['priority'],
        location: String(t.workLocation || t.location || ''),
        machine: String(t.machine || ''),
        createdAt: t.createdAt || null,
        templateId: null,
        ticketId: String(t.id || ''),
        status: normalizePlannerTicketStatus(t.status),
        workflowStage: isPlannerExternalizedTicket(t)
          ? 'externalized'
          : String(t.workflowStage || 'planned_internal'),
      }
    })
    .filter(Boolean) as ScheduledItem[]
}

function getPlanningDateFromDueDate(dueDate: Date) {
  const planningDate = new Date(dueDate)
  planningDate.setHours(0, 0, 0, 0)
  const day = planningDate.getDay()
  const offset = day === 1 ? 0 : day === 0 ? 1 : 8 - day
  planningDate.setDate(planningDate.getDate() + offset)
  return planningDate
}

function getPlannedTemplateIdsForCurrentCycle(
  dueTemplates: DueTemplate[],
  plannedList: PlannedApiItem[]
) {
  const planningDateByTemplateId = new Map(
    dueTemplates.map((template) => [template.id, template.planningDate])
  )

  return new Set(
    plannedList
      .map((item) => {
        const templateId = String(item?.templateId || '')
        if (!templateId) return ''
        const plannedDate = String(item?.date || '')
        const planningDate = planningDateByTemplateId.get(templateId)
        if (!planningDate || !plannedDate) return ''
        return plannedDate >= planningDate ? templateId : ''
      })
      .filter(Boolean)
  )
}

export default function usePlannerData({
  canViewTickets,
  ticketType = 'maquinaria',
  weekStart,
  dayCount,
  tab,
  preventiusFilter,
  ticketsAgeFilter,
}: UsePlannerDataArgs) {
  const isLoadingWeekRef = useRef(false)
  const pendingReloadRef = useRef(false)
  const requestedScheduleSeqRef = useRef(0)
  const latestLoadWeekScheduleRef = useRef<(() => Promise<void>) | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [realTickets, setRealTickets] = useState<TicketCard[]>([])
  const [ticketById, setTicketById] = useState<Record<string, Ticket>>({})
  const [centers, setCenters] = useState<CenterRow[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<Array<{ code: string; name: string; label: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string }>>([])
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([])
  const [plannedPreventiuTemplateIds, setPlannedPreventiuTemplateIds] = useState<string[]>([])
  const [externalizedTickets, setExternalizedTickets] = useState<TicketCard[]>([])

  const loadTicketsData = useCallback(async (weekRange?: { start: string; end: string }) => {
    if (!canViewTickets) {
      return {
        list: [] as PlannerTicketLike[],
        lookup: {},
        pending: [] as TicketCard[],
        externalized: [] as TicketCard[],
      }
    }
    const requests: Promise<Response>[] = [
      fetch(`/api/maintenance/tickets?ticketType=${ticketType}&limit=1000`, { cache: 'no-store' }),
    ]
    if (weekRange?.start && weekRange?.end) {
      requests.push(
        fetch(
          `/api/maintenance/tickets?ticketType=${ticketType}&start=${encodeURIComponent(weekRange.start)}&end=${encodeURIComponent(weekRange.end)}&dateMode=planned&limit=500`,
          { cache: 'no-store' }
        )
      )
    }
    const responses = await Promise.all(requests)
    const baseJson = responses[0].ok ? await responses[0].json() : { tickets: [] }
    const plannedJson =
      responses[1] && responses[1].ok ? await responses[1].json() : { tickets: [] }
    const baseList: PlannerTicketLike[] = Array.isArray(baseJson?.tickets) ? baseJson.tickets : []
    const plannedList: PlannerTicketLike[] = Array.isArray(plannedJson?.tickets)
      ? plannedJson.tickets
      : []
    const list = mergeTicketLists(baseList, plannedList)
    return {
      list,
      lookup: buildTicketLookup(list),
      pending: mapPendingTickets(list),
      externalized: mapExternalizedTickets(list),
    }
  }, [canViewTickets, ticketType])

  const dueTemplates = useMemo<DueTemplate[]>(() => {
    const weekEnd = addDays(weekStart, dayCount - 1)
    weekEnd.setHours(23, 59, 59, 999)
    const weekStartDay = new Date(weekStart)
    weekStartDay.setHours(0, 0, 0, 0)

    return templates
      .map((template) => {
        const lastDone = parseStoredDate(template.lastDone)
        const nextDue = lastDone ? calculateNextDue(lastDone, template.periodicity) : null
        return { template, nextDue }
      })
      .filter(({ nextDue }) => Boolean(nextDue) && (nextDue as Date).getTime() <= weekEnd.getTime())
      .sort((a, b) => {
        const da = (a.nextDue as Date).getTime()
        const db = (b.nextDue as Date).getTime()
        if (da !== db) return da - db
        return a.template.name.localeCompare(b.template.name)
      })
      .map(({ template, nextDue }) => {
        const due = nextDue as Date
        const planningDate = getPlanningDateFromDueDate(due)
        return {
          ...template,
          dueState: (due.getTime() < weekStartDay.getTime() ? 'overdue' : 'due') as
            | 'due'
            | 'overdue',
          dueDate: format(due, 'yyyy-MM-dd'),
          planningDate: format(planningDate, 'yyyy-MM-dd'),
        }
      })
      .filter((template) => {
        const planningDate = parseStoredDate(template.planningDate)
        return Boolean(planningDate) && (planningDate as Date).getTime() <= weekEnd.getTime()
      })
  }, [templates, weekStart, dayCount])

  const filteredDueTemplates = useMemo(() => {
    if (preventiusFilter == null) return dueTemplates
    return dueTemplates.filter((t) => t.dueState === preventiusFilter)
  }, [dueTemplates, preventiusFilter])

  const filteredRealTickets = useMemo(() => {
    const base = [...realTickets].sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
      return a.code.localeCompare(b.code)
    })
    return ticketsAgeFilter == null
      ? base
      : base.filter((ticket) => ticket.ageBucket === ticketsAgeFilter)
  }, [realTickets, ticketsAgeFilter])

  const filteredExternalizedTickets = useMemo(() => {
    const base = [...externalizedTickets].sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
      return a.code.localeCompare(b.code)
    })
    const ageFiltered =
      ticketsAgeFilter == null
        ? base
        : base.filter((ticket) => ticket.ageBucket === ticketsAgeFilter)
    return ageFiltered.sort((a, b) => {
      const statusWeight = (value?: string) => {
        const status = normalizePlannerTicketStatus(value)
        if (status === 'validat') return 0
        if (status === 'fet') return 1
        if (status === 'espera') return 2
        if (status === 'en_curs') return 3
        if (status === 'assignat') return 4
        if (status === 'reassignat') return 5
        if (status === 'nou') return 6
        if (status === 'no_fet') return 7
        return 9
      }
      const statusDiff = statusWeight(a.status) - statusWeight(b.status)
      if (statusDiff !== 0) return statusDiff
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
      return a.code.localeCompare(b.code)
    })
  }, [externalizedTickets, ticketsAgeFilter])

  const visibleItems = useMemo(() => {
    if (tab === 'preventius') {
      return filteredDueTemplates.filter(
        (item) =>
          !plannedPreventiuTemplateIds.includes(item.id) &&
          !isPreventiuScheduledInWeek(item.id, item.name, scheduledItems)
      )
    }
    if (tab === 'externalized') {
      return filteredExternalizedTickets.filter((item) => !isTicketScheduledInWeek(item.id, scheduledItems))
    }
    return filteredRealTickets.filter((item) => !isTicketScheduledInWeek(item.id, scheduledItems))
  }, [
    tab,
    filteredDueTemplates,
    filteredExternalizedTickets,
    filteredRealTickets,
    plannedPreventiuTemplateIds,
    scheduledItems,
  ])

  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = 8; h <= 17; h += 1) {
      slots.push(`${String(h).padStart(2, '0')}:00`)
      slots.push(`${String(h).padStart(2, '0')}:30`)
    }
    slots.push('18:00')
    return slots
  }, [])

  useEffect(() => {
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(addDays(weekStart, dayCount - 1), 'yyyy-MM-dd')
    const loadMasterData = async () => {
      try {
        const [templatesRes, centersRes, machinesRes, usersRes, ticketsData] = await Promise.all([
          ticketType === 'maquinaria'
            ? fetch('/api/maintenance/templates', { cache: 'no-store' })
            : Promise.resolve(null),
          fetch('/api/maintenance/data/centers', { cache: 'no-store' }),
          fetch('/api/maintenance/machines', { cache: 'no-store' }),
          fetch(
            ticketType === 'deco'
              ? '/api/personnel?includeDepartmentHeads=true'
              : '/api/personnel?department=manteniment',
            { cache: 'no-store' }
          ),
          loadTicketsData({ start: startStr, end: endStr }),
        ])

        const templatesJson = templatesRes?.ok ? await templatesRes.json() : { templates: [] }
        const templateList = Array.isArray(templatesJson?.templates) ? templatesJson.templates : []
        setTemplates(
          templateList
            .filter((t: TemplateApiItem) => t?.id && (t?.name || t?.title))
            .map((t: TemplateApiItem) => ({
              id: String(t.id),
              name: String(t.name || t.title || ''),
              periodicity: t.periodicity,
              lastDone: t.lastDone || null,
              location: t.location || '',
              primaryOperator: t.primaryOperator || '',
              backupOperator: t.backupOperator || '',
              autoPlanExcludedWeeks: Array.isArray(t.autoPlanExcludedWeeks)
                ? t.autoPlanExcludedWeeks.map(String)
                : [],
            }))
        )

        const centersJson = centersRes.ok ? await centersRes.json() : { centers: [] }
        const nextCenters = Array.isArray(centersJson?.centers) ? centersJson.centers : []
        setCenters(nextCenters)
        setLocations(buildControlledMaintenanceLocations(nextCenters))

        const machinesJson = machinesRes.ok ? await machinesRes.json() : { machines: [] }
        setMachines(Array.isArray(machinesJson?.machines) ? machinesJson.machines : [])

        const usersJson = usersRes.ok ? await usersRes.json() : { data: [] }
        const usersList = Array.isArray(usersJson?.data) ? usersJson.data : []
        setUsers(
          usersList
            .filter((u: UserApiItem) => u?.id && u?.name)
            .filter((u: UserApiItem) => {
              if (ticketType !== 'deco') return true
              const department = normalizeName(u.departmentLower || u.department || '')
              return ['deco', 'decoracio', 'decoracions'].includes(department)
            })
            .map((u: UserApiItem) => ({
              id: String(u.id),
              name: String(u.name),
              department: (u.departmentLower || u.department || '').toString(),
            }))
        )

        setTicketById(ticketsData.lookup)
        setRealTickets(ticketsData.pending)
        setExternalizedTickets(ticketsData.externalized)
      } catch {
        setTemplates([])
        setCenters([])
        setLocations([])
        setMachines([])
        setUsers([])
        setTicketById({})
        setRealTickets([])
        setExternalizedTickets([])
      }
    }
    void loadMasterData()
  }, [dayCount, loadTicketsData, ticketType, weekStart])

  const resolveWorkerIds = useCallback(
    (names: string[]) => {
      if (users.length === 0) return []
      const map = new Map(users.map((u) => [normalizeName(u.name), u.id]))
      return names
        .map((n) => map.get(normalizeName(n)))
        .filter((id): id is string => Boolean(id))
    },
    [users]
  )

  const loadWeekSchedule = useCallback(async () => {
    requestedScheduleSeqRef.current += 1
    const requestId = requestedScheduleSeqRef.current
    if (isLoadingWeekRef.current) {
      pendingReloadRef.current = true
      return
    }
    isLoadingWeekRef.current = true
    pendingReloadRef.current = false
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(addDays(weekStart, dayCount - 1), 'yyyy-MM-dd')
    try {
      const dueDates = dueTemplates
        .map((template) => template.planningDate)
        .filter(Boolean)
        .sort()
      const plannedStartStr = dueDates[0] && dueDates[0] < startStr ? dueDates[0] : startStr

      const [plannedRes, ticketsData] = await Promise.all([
        ticketType === 'maquinaria'
          ? fetch(
              `/api/maintenance/preventius/planned?start=${encodeURIComponent(plannedStartStr)}&end=${encodeURIComponent(endStr)}`,
              { cache: 'no-store' }
            )
          : Promise.resolve(null),
        loadTicketsData({ start: startStr, end: endStr }),
      ])

      const plannedJson = plannedRes?.ok ? await plannedRes.json() : { items: [] }
      const plannedList = Array.isArray(plannedJson?.items) ? plannedJson.items : []
      if (requestedScheduleSeqRef.current !== requestId) return
      const plannedMapped: ScheduledItem[] = plannedList
        .map((p: PlannedApiItem) => {
          const date = parseISO(String(p.date || ''))
          const dayIndex = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
          if (dayIndex < 0 || dayIndex >= dayCount) return null
          const startTime = String(p.startTime || '')
          const endTime = String(p.endTime || '')
          if (!startTime || !endTime) return null
          const minutes = Math.max(30, minutesFromTime(endTime) - minutesFromTime(startTime))
          const workers = Array.isArray(p.workerNames) ? p.workerNames.map(String) : []
          return {
            id: String(p.id || ''),
            kind: 'preventiu' as const,
            title: String(p.title || ''),
            workers,
            workersCount: workers.length || 1,
            dayIndex,
            start: startTime,
            end: endTime,
            minutes,
            priority: (p.priority || 'normal') as ScheduledItem['priority'],
            location: String(p.location || ''),
            templateId: p.templateId || null,
            ticketId: null,
            status: String(p.lastStatus || 'assignat'),
            progress:
              typeof p.lastProgress === 'number'
                ? p.lastProgress
                : Number.isFinite(Number(p.lastProgress))
                  ? Number(p.lastProgress)
                  : undefined,
          }
        })
        .filter(Boolean) as ScheduledItem[]

      const ticketList = ticketsData.list
      if (requestedScheduleSeqRef.current !== requestId) return
      setTicketById(ticketsData.lookup)
      setRealTickets(ticketsData.pending)
      setExternalizedTickets(ticketsData.externalized)
      const ticketsMapped = mapPlannedTickets(ticketList, weekStart, dayCount, startStr, endStr)
      const externalizedMapped = mapExternalizedCalendarTickets(
        ticketList,
        weekStart,
        dayCount,
        startStr,
        endStr
      )

      const workingPreventius = [...plannedMapped]
      const workingAgenda: ScheduledItem[] = [...plannedMapped, ...ticketsMapped, ...externalizedMapped]
      const templateMap = new Map(templates.map((template) => [template.id, template]))
      const maintenanceWorkerNames = users
        .map((user) => String(user.name || '').trim())
        .filter(Boolean)
      const alreadyPlannedTemplateIds = getPlannedTemplateIdsForCurrentCycle(dueTemplates, plannedList)
      if (requestedScheduleSeqRef.current !== requestId) return
      setPlannedPreventiuTemplateIds(Array.from(alreadyPlannedTemplateIds) as string[])

      for (let index = 0; index < workingPreventius.length; index += 1) {
        if (requestedScheduleSeqRef.current !== requestId) return
        const item = workingPreventius[index]
        if (!item.templateId || item.workers.length > 0) continue
        const template = templateMap.get(String(item.templateId))
        if (!template) continue
        const preferredWorkers = [template.primaryOperator, template.backupOperator]
          .map((worker) => String(worker || '').trim())
          .filter(Boolean)
        if (preferredWorkers.length === 0) continue

        const preferredSlot = findBestPreventiuSlot(workingAgenda, {
          minutes: item.minutes,
          preferredWorkers,
          fallbackWorkers: maintenanceWorkerNames,
          firstDayIndex: item.dayIndex,
          dayCount,
          ignoreId: item.id,
          normalizeName,
          minutesFromTime,
          timeFromMinutes,
          allowUnassigned: false,
        })
        if (!preferredSlot) continue

        const dateStr = format(addDays(weekStart, preferredSlot.dayIndex), 'yyyy-MM-dd')
        const workerIds = resolveWorkerIds(preferredSlot.workers)
        const nextItem: ScheduledItem = {
          ...item,
          dayIndex: preferredSlot.dayIndex,
          start: preferredSlot.start,
          end: preferredSlot.end,
          workers: preferredSlot.workers,
          workersCount: preferredSlot.workers.length || 1,
          status: item.status || 'assignat',
        }

        try {
          const res = await fetch(`/api/maintenance/preventius/planned/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                date: dateStr,
                startTime: preferredSlot.start,
                endTime: preferredSlot.end,
                workerNames: preferredSlot.workers,
                workerIds,
              }),
            })
          if (!res.ok) continue
          workingPreventius[index] = nextItem
          const agendaIndex = workingAgenda.findIndex((entry) => entry.id === item.id)
          if (agendaIndex >= 0) workingAgenda[agendaIndex] = nextItem
        } catch {
          continue
        }
      }

      for (const template of dueTemplates) {
        if (requestedScheduleSeqRef.current !== requestId) return
        if (alreadyPlannedTemplateIds.has(template.id)) continue
        if ((template.autoPlanExcludedWeeks || []).includes(format(weekStart, "yyyy-'W'II"))) continue

        const slot = findAutoPlanSlot(workingAgenda, template, {
          weekStart,
          dayCount,
          availableWorkerNames: maintenanceWorkerNames,
          parseStoredDate,
          normalizeName,
          minutesFromTime,
          timeFromMinutes,
        })
        if (!slot) continue

        const dateStr = format(addDays(weekStart, slot.dayIndex), 'yyyy-MM-dd')
        const workerNames = slot.workers
        const workerIds = resolveWorkerIds(workerNames)
        const payload = {
          templateId: template.id,
          title: template.name,
          date: dateStr,
          startTime: slot.start,
          endTime: slot.end,
          priority: 'normal' as const,
          location: template.location || '',
          workerNames,
          workerIds,
        }

        try {
          const res = await fetch('/api/maintenance/preventius/planned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) continue
          const json = await res.json().catch(() => null)
          const newId = json?.id ? String(json.id) : `auto-${template.id}-${dateStr}-${slot.start}`
          const nextItem: ScheduledItem = {
            id: newId,
            kind: 'preventiu',
            title: template.name,
            workers: workerNames,
            workersCount: workerNames.length || 1,
            dayIndex: slot.dayIndex,
            start: slot.start,
            end: slot.end,
            minutes: slot.minutes,
            priority: 'normal',
            location: template.location || '',
            templateId: template.id,
            ticketId: null,
            status: 'assignat',
          }
          workingPreventius.push(nextItem)
          workingAgenda.push(nextItem)
          alreadyPlannedTemplateIds.add(template.id)
        } catch {
          continue
        }
      }

      if (requestedScheduleSeqRef.current !== requestId) return
      setPlannedPreventiuTemplateIds(Array.from(alreadyPlannedTemplateIds) as string[])
      setScheduledItems([...workingPreventius, ...ticketsMapped, ...externalizedMapped])
    } catch {
      if (requestedScheduleSeqRef.current !== requestId) return
      setPlannedPreventiuTemplateIds([])
      setScheduledItems([])
    } finally {
      isLoadingWeekRef.current = false
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false
        void latestLoadWeekScheduleRef.current?.()
      }
    }
  }, [dayCount, dueTemplates, loadTicketsData, resolveWorkerIds, templates, ticketType, users, weekStart])

  useEffect(() => {
    latestLoadWeekScheduleRef.current = loadWeekSchedule
  }, [loadWeekSchedule])

  useEffect(() => {
    void loadWeekSchedule()
    const onFocus = () => {
      void loadWeekSchedule()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadWeekSchedule])

  const getWorkerConflicts = useCallback(
    (dayIndex: number, start: string, end: string, workers: string[], ignoreId?: string) => {
      const startMin = minutesFromTime(start)
      const endMin = minutesFromTime(end)
      const conflicts = new Set<string>()
      const moving = new Set(workers.map((w) => normalizeName(w)).filter(Boolean))
      if (moving.size === 0) return []
      scheduledItems.forEach((item) => {
        if (ignoreId && item.id === ignoreId) return
        if (item.dayIndex !== dayIndex) return
        const s = minutesFromTime(item.start)
        const e = minutesFromTime(item.end)
        const overlaps = startMin < e && endMin > s
        if (!overlaps) return
        item.workers.forEach((worker) => {
          const key = normalizeName(worker)
          if (key && moving.has(key)) conflicts.add(worker)
        })
      })
      return Array.from(conflicts)
    },
    [scheduledItems]
  )

  const availableWorkers = useCallback(
    (dayIndex: number, start: string, end: string, ignoreId?: string) => {
      const operators =
        users
          .filter((u) => {
            const department = normalizeName(u.department || '')
            return ticketType === 'deco'
              ? ['deco', 'decoracio', 'decoracions'].includes(department)
              : department.includes('manten')
          })
          .map((u) => ({ id: u.id, name: u.name })) || []
      const list = operators.length > 0 ? operators : users.map((u) => ({ id: u.id, name: u.name }))
      const opKey = (name: string) => normalizeName(name)
      return list.filter((op) => {
        const opNorm = opKey(op.name)
        if (!opNorm) return true
        const has = scheduledItems.some((item) => {
          if (ignoreId && item.id === ignoreId) return false
          if (item.dayIndex !== dayIndex) return false
          const s = minutesFromTime(item.start)
          const e = minutesFromTime(item.end)
          const startMin = minutesFromTime(start)
          const endMin = minutesFromTime(end)
          const overlaps = startMin < e && endMin > s
          return overlaps && item.workers.some((w) => opKey(w) === opNorm)
        })
        return !has
      })
    },
    [scheduledItems, ticketType, users]
  )

  const persistTicketPlanning = useCallback(
    async (item: ScheduledItem) => {
      const ticketId = item.ticketId || (item.kind === 'ticket' ? item.id : null)
      if (!ticketId) return
      const day = addDays(weekStart, item.dayIndex)
      const dateStr = format(day, 'yyyy-MM-dd')
      const plannedStart = new Date(`${dateStr}T${item.start}:00`).getTime()
      const plannedEnd = new Date(`${dateStr}T${item.end}:00`).getTime()
      const assignedToNames = item.workers || []
      const assignedToIds = resolveWorkerIds(assignedToNames)

      const res = await fetch(`/api/maintenance/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannedStart,
          plannedEnd,
          estimatedMinutes: item.minutes,
          workflowStage: 'planned_internal',
          location: item.location || undefined,
          machine: item.machine || undefined,
          assignedToNames: assignedToNames.length ? assignedToNames : undefined,
          assignedToIds: assignedToIds.length ? assignedToIds : undefined,
          ...(['no_fet', 'reassignat'].includes(normalizePlannerTicketStatus(ticketById[ticketId]?.status)) &&
          assignedToIds.length > 0
            ? { status: 'assignat' }
            : {}),
        }),
      })

      if (!res.ok) {
        throw new Error('ticket_planning_failed')
      }
    },
    [resolveWorkerIds, ticketById, weekStart]
  )

  const legendWorkers = useMemo(() => {
    const unique = new Set<string>()
    scheduledItems.forEach((item) => item.workers.forEach((worker) => unique.add(worker)))
    return Array.from(unique).sort((a, b) => a.localeCompare(b)).slice(0, 10)
  }, [scheduledItems])

  return {
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
  }
}

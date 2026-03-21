'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'

type Template = {
  id: string
  name: string
  periodicity?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  lastDone?: string | null
  location?: string
  primaryOperator?: string
  backupOperator?: string
}

type DueTemplate = Template & {
  dueState: 'due' | 'overdue'
  dueDate: string
}

type TicketCard = {
  id: string
  code: string
  title: string
  priority: 'urgent' | 'alta' | 'normal' | 'baixa'
  minutes: number
  status?: string
  createdAt?: string | number | null
  ageDays: number
  ageBucket: 'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus'
  location?: string
  machine?: string
}

type ScheduledItem = {
  id: string
  kind: 'preventiu' | 'ticket'
  title: string
  workers: string[]
  workersCount: number
  dayIndex: number
  start: string
  end: string
  minutes: number
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  machine?: string
  templateId?: string | null
  ticketId?: string | null
}

const ROW_HEIGHT = 40
const GRID_GAP = 1
const HEADER_HEIGHT = 32
const TIME_COL_WIDTH = 80
const DAY_COUNT = 6
const AUTO_PLAN_DAY_COUNT = 5
const AUTO_PLAN_DEFAULT_MINUTES = 60
const AUTO_PLAN_START_MINUTES = 9 * 60
const AUTO_PLAN_END_MINUTES = 17 * 60
const AUTO_PLAN_SLOT_STEP = 30
const AUTO_PLAN_MAX_UNASSIGNED = 2

const WORKER_BADGE_CLASSES = [
  'bg-blue-100 text-blue-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-lime-100 text-lime-800',
  'bg-fuchsia-100 text-fuchsia-800',
]

const PRIORITY_LABEL: Record<'urgent' | 'alta' | 'normal' | 'baixa', string> = {
  urgent: 'Urgent',
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa',
}

const normalizeName = (value: string) =>
  value
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

const getWorkerBadgeClass = (name: string) => {
  const key = normalizeName(name)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return WORKER_BADGE_CLASSES[hash % WORKER_BADGE_CLASSES.length]
}

const getPriorityTone = (
  kind: 'preventiu' | 'ticket',
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
) => {
  const safe = priority || 'normal'
  const base = kind === 'preventiu' ? 'bg-emerald-50' : 'bg-sky-50'

  if (safe === 'urgent') {
    return {
      card: `${base} border-red-300 ring-1 ring-red-200`,
      marker: 'bg-red-500',
      pill: 'bg-red-100 text-red-800',
    }
  }
  if (safe === 'alta') {
    return {
      card: `${base} border-amber-300 ring-1 ring-amber-200`,
      marker: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-800',
    }
  }
  if (safe === 'baixa') {
    return {
      card: `${base} border-slate-300`,
      marker: 'bg-slate-400',
      pill: 'bg-slate-100 text-slate-700',
    }
  }
  return {
    card: kind === 'preventiu' ? `${base} border-emerald-200` : `${base} border-sky-200`,
    marker: kind === 'preventiu' ? 'bg-emerald-500' : 'bg-sky-500',
    pill: kind === 'preventiu' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800',
  }
}

const parseStoredDate = (value?: string | null) => {
  const raw = (value || '').trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const slashMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    const date = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]))
    date.setHours(0, 0, 0, 0)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const parsed = parseISO(raw)
  if (Number.isNaN(parsed.getTime())) return null
  parsed.setHours(0, 0, 0, 0)
  return parsed
}

const calculateNextDue = (lastDone: Date, periodicity?: Template['periodicity']) => {
  if (!periodicity) return null
  const next = new Date(lastDone)
  if (periodicity === 'daily') next.setDate(next.getDate() + 1)
  if (periodicity === 'weekly') next.setDate(next.getDate() + 7)
  if (periodicity === 'monthly') next.setMonth(next.getMonth() + 1)
  if (periodicity === 'quarterly') next.setMonth(next.getMonth() + 3)
  if (periodicity === 'yearly') next.setFullYear(next.getFullYear() + 1)
  next.setHours(23, 59, 59, 999)
  return next
}

const PRIORITY_WEIGHT: Record<'urgent' | 'alta' | 'normal' | 'baixa', number> = {
  urgent: 0,
  alta: 1,
  normal: 2,
  baixa: 3,
}

const getAgeDays = (value?: string | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor((Date.now() - value) / 86400000))
  }
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor((Date.now() - parsed) / 86400000))
    }
  }
  return 0
}

const getAgeBucket = (ageDays: number): TicketCard['ageBucket'] => {
  if (ageDays <= 0) return 'today'
  if (ageDays <= 2) return 'days_1_2'
  if (ageDays <= 7) return 'days_3_7'
  return 'days_8_plus'
}

const getAgeLabel = (ageDays: number) => {
  if (ageDays <= 0) return 'Avui'
  if (ageDays === 1) return '1 dia'
  return `${ageDays} dies`
}

const getAgeBadgeClass = (ageBucket: TicketCard['ageBucket']) => {
  if (ageBucket === 'days_8_plus') return 'bg-red-100 text-red-800'
  if (ageBucket === 'days_3_7') return 'bg-amber-100 text-amber-800'
  if (ageBucket === 'days_1_2') return 'bg-sky-100 text-sky-800'
  return 'bg-emerald-100 text-emerald-800'
}

const formatTicketCreatedAt = (value?: string | number | null) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return format(new Date(value), 'dd/MM')
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return format(parsed, 'dd/MM')
    }
  }
  return ''
}

export default function PreventiusPlanificadorPage() {
  const isLoadingWeekRef = useRef(false)
  const pendingReloadRef = useRef(false)
  const [filters, setFiltersState] = useState<FiltersState>(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    const end = endOfWeek(base, { weekStartsOn: 1 })
    return {
      start: format(base, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      mode: 'week',
    }
  })
  const [tab, setTab] = useState<'preventius' | 'tickets'>('preventius')
  const [preventiusFilter, setPreventiusFilter] = useState<'all' | 'due' | 'overdue'>('all')
  const [ticketsAgeFilter, setTicketsAgeFilter] = useState<
    'all' | 'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus'
  >('all')
  const [templates, setTemplates] = useState<Template[]>([])
  const [realTickets, setRealTickets] = useState<TicketCard[]>([])
  const [machines, setMachines] = useState<Array<{ code: string; name: string; label: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string }>>([])
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([])
  const [showLegend, setShowLegend] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<{
    id?: string
    kind: 'preventiu' | 'ticket'
    templateId?: string | null
    ticketId?: string | null
    title: string
    dayIndex: number
    start: string
    duration: number
    end: string
    workersCount: number
    workers: string[]
    priority: 'urgent' | 'alta' | 'normal' | 'baixa'
    location: string
    machine: string
  } | null>(null)

  const setFilters = (partial: Partial<FiltersState>) =>
    setFiltersState((prev) => ({ ...prev, ...partial }))

  const weekStart = useMemo(() => parseISO(filters.start), [filters.start])
  const weekLabel = format(weekStart, "yyyy-'W'II")
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  const dueTemplates = useMemo<DueTemplate[]>(() => {
    const weekEnd = addDays(weekStart, DAY_COUNT - 1)
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
        return {
          ...template,
          dueState: due.getTime() < weekStartDay.getTime() ? 'overdue' : 'due',
          dueDate: format(due, 'yyyy-MM-dd'),
        }
      })
  }, [templates, weekStart])

  const filteredDueTemplates = useMemo(() => {
    if (preventiusFilter === 'all') return dueTemplates
    return dueTemplates.filter((t) => t.dueState === preventiusFilter)
  }, [dueTemplates, preventiusFilter])

  const filteredRealTickets = useMemo(() => {
    const base = [...realTickets].sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
      return a.code.localeCompare(b.code)
    })
    if (ticketsAgeFilter === 'all') return base
    return base.filter((ticket) => ticket.ageBucket === ticketsAgeFilter)
  }, [realTickets, ticketsAgeFilter])

  const visibleItems = useMemo(() => {
    if (tab === 'preventius') return filteredDueTemplates
    return filteredRealTickets
  }, [tab, filteredDueTemplates, filteredRealTickets])

  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = 8; h <= 16; h += 1) {
      slots.push(`${String(h).padStart(2, '0')}:00`)
      slots.push(`${String(h).padStart(2, '0')}:30`)
    }
    slots.push('17:00')
    return slots
  }, [])

  useEffect(() => {
    if (tab !== 'tickets') return
    const loadTickets = async () => {
      try {
        const res = await fetch('/api/maintenance/tickets?ticketType=maquinaria', {
          cache: 'no-store',
        })
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json?.tickets) ? json.tickets : []
        const mapped = list
          .filter((t: any) => !['fet', 'no_fet', 'resolut', 'validat'].includes(String(t.status || '')))
          .map((t: any) => {
            const code = t.ticketCode || t.incidentNumber || 'TIC'
            const title = t.description || t.machine || t.location || ''
            const minutes = Number(t.estimatedMinutes || 60)
            const ageDays = getAgeDays(t.createdAt)
            return {
              id: String(t.id || code),
              code,
              title,
              priority: (t.priority || 'normal') as TicketCard['priority'],
              minutes,
              status: String(t.status || ''),
              createdAt: t.createdAt || null,
              ageDays,
              ageBucket: getAgeBucket(ageDays),
              location: t.location || '',
              machine: t.machine || '',
            }
          })
        setRealTickets(mapped)
      } catch {
        return
      }
    }
    loadTickets()
  }, [tab])

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch('/api/maintenance/templates', { cache: 'no-store' })
        if (!res.ok) {
          setTemplates([])
          return
        }
        const json = await res.json()
        const list = Array.isArray(json?.templates) ? json.templates : []
        const mapped = list
          .filter((t: any) => t?.id && (t?.name || t?.title))
          .map((t: any) => ({
            id: String(t.id),
            name: String(t.name || t.title || ''),
            periodicity: t.periodicity,
            lastDone: t.lastDone || null,
            location: t.location || '',
            primaryOperator: t.primaryOperator || '',
            backupOperator: t.backupOperator || '',
          }))
        setTemplates(mapped)
      } catch {
        setTemplates([])
      }
    }
    loadTemplates()
  }, [])

  useEffect(() => {
    const loadMachines = async () => {
      try {
        const res = await fetch('/api/maintenance/machines', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        setMachines(Array.isArray(json?.machines) ? json.machines : [])
      } catch {
        setMachines([])
      }
    }
    loadMachines()
  }, [])

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/personnel?department=manteniment', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const list = Array.isArray(json?.data) ? json.data : []
        const mapped = list
          .filter((u: any) => u?.id && u?.name)
          .map((u: any) => ({
            id: String(u.id),
            name: String(u.name),
            department: (u.departmentLower || u.department || '').toString(),
          }))
        setUsers(mapped)
      } catch {
        setUsers([])
      }
    }
    loadUsers()
  }, [])

  const minutesFromTime = (time: string) => {
    const [hh, mm] = time.split(':').map(Number)
    return hh * 60 + mm
  }

  const timeFromMinutes = (total: number) => {
    const hh = Math.floor(total / 60)
    const mm = total % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  const rangesOverlap = (startA: number, endA: number, startB: number, endB: number) =>
    startA < endB && endA > startB

  const resolveTemplateWorkerNames = (template: Template) => {
    const primary = (template.primaryOperator || '').trim()
    if (primary) return [primary]
    const backup = (template.backupOperator || '').trim()
    if (backup) return [backup]
    return []
  }

  const getAutoPlanStartDayIndex = (dueDate: string) => {
    const date = parseStoredDate(dueDate)
    if (!date) return 0
    const index = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
    return Math.max(0, Math.min(AUTO_PLAN_DAY_COUNT - 1, index))
  }

  const hasWorkerConflict = (
    items: ScheduledItem[],
    dayIndex: number,
    startMin: number,
    endMin: number,
    workers: string[]
  ) => {
    if (workers.length === 0) return false
    const wanted = new Set(workers.map(normalizeName))
    return items.some((item) => {
      if (item.dayIndex !== dayIndex) return false
      if (!rangesOverlap(startMin, endMin, minutesFromTime(item.start), minutesFromTime(item.end))) {
        return false
      }
      return item.workers.some((worker) => wanted.has(normalizeName(worker)))
    })
  }

  const countUnassignedPreventius = (
    items: ScheduledItem[],
    dayIndex: number,
    startMin: number,
    endMin: number
  ) =>
    items.filter((item) => {
      if (item.kind !== 'preventiu') return false
      if (item.dayIndex !== dayIndex) return false
      if (item.workers.length > 0) return false
      return rangesOverlap(startMin, endMin, minutesFromTime(item.start), minutesFromTime(item.end))
    }).length

  const findAvailablePreventiuSlot = (
    items: ScheduledItem[],
    options: {
      minutes: number
      workers: string[]
      firstDayIndex: number
      ignoreId?: string
    }
  ) => {
    const { minutes, workers, firstDayIndex, ignoreId } = options
    const comparableItems = ignoreId ? items.filter((item) => item.id !== ignoreId) : items

    for (let dayIndex = firstDayIndex; dayIndex < AUTO_PLAN_DAY_COUNT; dayIndex += 1) {
      for (
        let startMin = AUTO_PLAN_START_MINUTES;
        startMin + minutes <= AUTO_PLAN_END_MINUTES;
        startMin += AUTO_PLAN_SLOT_STEP
      ) {
        const endMin = startMin + minutes
        if (workers.length > 0) {
          if (hasWorkerConflict(comparableItems, dayIndex, startMin, endMin, workers)) continue
          return {
            dayIndex,
            start: timeFromMinutes(startMin),
            end: timeFromMinutes(endMin),
            workers,
            minutes,
          }
        }

        const overlappingWithoutWorker = countUnassignedPreventius(
          comparableItems,
          dayIndex,
          startMin,
          endMin
        )
        if (overlappingWithoutWorker >= AUTO_PLAN_MAX_UNASSIGNED) continue
        return {
          dayIndex,
          start: timeFromMinutes(startMin),
          end: timeFromMinutes(endMin),
          workers: [] as string[],
          minutes,
        }
      }
    }

    return null
  }

  const findAutoPlanSlot = (items: ScheduledItem[], template: DueTemplate) =>
    findAvailablePreventiuSlot(items, {
      minutes: AUTO_PLAN_DEFAULT_MINUTES,
      workers: resolveTemplateWorkerNames(template),
      firstDayIndex: getAutoPlanStartDayIndex(template.dueDate),
    })

  const loadWeekSchedule = async () => {
    if (isLoadingWeekRef.current) {
      pendingReloadRef.current = true
      return
    }
    isLoadingWeekRef.current = true
    pendingReloadRef.current = false
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(addDays(weekStart, DAY_COUNT - 1), 'yyyy-MM-dd')
    try {
      const [plannedRes, ticketsRes] = await Promise.all([
        fetch(
          `/api/maintenance/preventius/planned?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`,
          { cache: 'no-store' }
        ),
        fetch('/api/maintenance/tickets?ticketType=maquinaria', { cache: 'no-store' }),
      ])

      const plannedJson = plannedRes.ok ? await plannedRes.json() : { items: [] }
      const plannedList = Array.isArray(plannedJson?.items) ? plannedJson.items : []
      const plannedMapped: ScheduledItem[] = plannedList
        .map((p: any) => {
          const date = parseISO(String(p.date || ''))
          const dayIndex = Math.round((date.getTime() - weekStart.getTime()) / 86400000)
          if (dayIndex < 0 || dayIndex >= DAY_COUNT) return null
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
          }
        })
        .filter(Boolean) as ScheduledItem[]

      const workingPreventius = [...plannedMapped]
      const templateMap = new Map(templates.map((template) => [template.id, template]))
      const alreadyPlannedTemplateIds = new Set(
        workingPreventius.map((item) => String(item.templateId || '')).filter(Boolean)
      )

      for (let index = 0; index < workingPreventius.length; index += 1) {
        const item = workingPreventius[index]
        if (!item.templateId || item.workers.length > 0) continue
        const template = templateMap.get(String(item.templateId))
        if (!template) continue
        const desiredWorkers = resolveTemplateWorkerNames(template)
        if (desiredWorkers.length === 0) continue

        const preferredSlot = findAvailablePreventiuSlot(workingPreventius, {
          minutes: item.minutes,
          workers: desiredWorkers,
          firstDayIndex: item.dayIndex,
          ignoreId: item.id,
        })
        if (!preferredSlot) continue

        const dateStr = format(addDays(weekStart, preferredSlot.dayIndex), 'yyyy-MM-dd')
        const workerIds = resolveWorkerIds(desiredWorkers)
        const nextItem: ScheduledItem = {
          ...item,
          dayIndex: preferredSlot.dayIndex,
          start: preferredSlot.start,
          end: preferredSlot.end,
          workers: desiredWorkers,
          workersCount: desiredWorkers.length || 1,
        }

        try {
          const res = await fetch(`/api/maintenance/preventius/planned/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              date: dateStr,
              startTime: preferredSlot.start,
              endTime: preferredSlot.end,
              workerNames: desiredWorkers,
              workerIds,
            }),
          })
          if (!res.ok) continue
          workingPreventius[index] = nextItem
        } catch {
          continue
        }
      }

      for (const template of dueTemplates) {
        if (alreadyPlannedTemplateIds.has(template.id)) continue

        const slot = findAutoPlanSlot(workingPreventius, template)
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
          workingPreventius.push({
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
          })
          alreadyPlannedTemplateIds.add(template.id)
        } catch {
          continue
        }
      }

      const ticketsJson = ticketsRes.ok ? await ticketsRes.json() : { tickets: [] }
      const ticketList = Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets : []
      const ticketsMapped: ScheduledItem[] = ticketList
        .filter((t: any) => t.plannedStart && t.plannedEnd)
        .map((t: any) => {
          const start = new Date(Number(t.plannedStart))
          const end = new Date(Number(t.plannedEnd))
          const date = format(start, 'yyyy-MM-dd')
          if (date < startStr || date > endStr) return null
          const dayIndex = Math.round(
            (parseISO(date).getTime() - weekStart.getTime()) / 86400000
          )
          if (dayIndex < 0 || dayIndex >= DAY_COUNT) return null
          const workers = Array.isArray(t.assignedToNames) ? t.assignedToNames.map(String) : []
          const title = String(t.description || t.machine || t.location || '')
          const code = String(t.ticketCode || t.incidentNumber || 'TIC')
          return {
            id: String(t.id || ''),
            kind: 'ticket' as const,
            title: `${code} - ${title}`.trim(),
            workers,
            workersCount: workers.length || 1,
            dayIndex,
            start: format(start, 'HH:mm'),
            end: format(end, 'HH:mm'),
            minutes: Math.max(30, Number(t.estimatedMinutes || 60)),
            priority: (t.priority || 'normal') as any,
            location: String(t.location || ''),
            machine: String(t.machine || ''),
            templateId: null,
            ticketId: String(t.id || ''),
          }
        })
        .filter(Boolean) as ScheduledItem[]

      setScheduledItems([...workingPreventius, ...ticketsMapped])
    } catch {
      setScheduledItems([])
    } finally {
      isLoadingWeekRef.current = false
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false
        loadWeekSchedule()
      }
    }
  }

  useEffect(() => {
    loadWeekSchedule()
    const onFocus = () => loadWeekSchedule()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [weekStart, dueTemplates])

  const getRowIndex = (time: string) => {
    const [hh, mm] = time.split(':').map(Number)
    const minutesFromStart = (hh - 8) * 60 + mm
    return Math.max(0, Math.floor(minutesFromStart / 30))
  }

  const getWorkerConflicts = (
    dayIndex: number,
    start: string,
    end: string,
    workers: string[],
    ignoreId?: string
  ) => {
    const startMin = minutesFromTime(start)
    const endMin = minutesFromTime(end)
    const conflicts = new Set<string>()
    scheduledItems.forEach((i) => {
      if (ignoreId && i.id === ignoreId) return
      if (i.dayIndex !== dayIndex) return
      const s = minutesFromTime(i.start)
      const e = minutesFromTime(i.end)
      const overlaps = startMin < e && endMin > s
      if (!overlaps) return
      i.workers.forEach((w) => {
        if (workers.includes(w)) conflicts.add(w)
      })
    })
    return Array.from(conflicts)
  }

  const availableWorkers = (dayIndex: number, start: string, end: string, ignoreId?: string) => {
    const operators =
      users
        .filter((u) => normalizeName(u.department || '').includes('manten'))
        .map((u) => ({ id: u.id, name: u.name })) || []
    const list = operators.length > 0 ? operators : users.map((u) => ({ id: u.id, name: u.name }))
    return list.filter((op) => {
      const has = scheduledItems.some((i) => {
        if (ignoreId && i.id === ignoreId) return false
        if (i.dayIndex !== dayIndex) return false
        const s = minutesFromTime(i.start)
        const e = minutesFromTime(i.end)
        const startMin = minutesFromTime(start)
        const endMin = minutesFromTime(end)
        const overlaps = startMin < e && endMin > s
        return overlaps && i.workers.includes(op.name)
      })
      return !has
    })
  }

  const resolveWorkerIds = (names: string[]) => {
    if (users.length === 0) return []
    const map = new Map(
      users.map((u) => [normalizeName(u.name), u.id])
    )
    return names
      .map((n) => map.get(normalizeName(n)))
      .filter((id): id is string => Boolean(id))
  }

  const persistTicketPlanning = async (item: ScheduledItem) => {
    const ticketId = item.ticketId || (item.kind === 'ticket' ? item.id : null)
    if (!ticketId) return
    const day = addDays(weekStart, item.dayIndex)
    const dateStr = format(day, 'yyyy-MM-dd')
    const plannedStart = new Date(`${dateStr}T${item.start}:00`).getTime()
    const plannedEnd = new Date(`${dateStr}T${item.end}:00`).getTime()
    const assignedToNames = item.workers || []
    const assignedToIds = resolveWorkerIds(assignedToNames)

    try {
      await fetch(`/api/maintenance/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannedStart,
          plannedEnd,
          estimatedMinutes: item.minutes,
          location: item.location || undefined,
          machine: item.machine || undefined,
          assignedToNames: assignedToNames.length ? assignedToNames : undefined,
          assignedToIds: assignedToIds.length ? assignedToIds : undefined,
        }),
      })
    } catch {
      return
    }
  }

  const openModal = (next: typeof draft) => {
    setDraft(next)
    setIsModalOpen(true)
  }

  const legendWorkers = useMemo(() => {
    const unique = new Set<string>()
    scheduledItems.forEach((i) => i.workers.forEach((w) => unique.add(w)))
    return Array.from(unique).sort((a, b) => a.localeCompare(b)).slice(0, 10)
  }, [scheduledItems])

  const handleDrop = (dayIndex: number, startTime: string, data: string) => {
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
          }
        | { type: 'scheduled'; id: string }

      if (payload.type === 'scheduled') {
        const target = scheduledItems.find((i) => i.id === payload.id)
        if (!target) return
        const duration = minutesFromTime(target.end) - minutesFromTime(target.start)
        const newStart = startTime
        const newEnd = timeFromMinutes(minutesFromTime(newStart) + Math.max(30, duration))
      openModal({
        id: target.id,
        kind: target.kind,
        templateId: target.templateId || null,
        ticketId: target.ticketId || (target.kind === 'ticket' ? target.id : null),
        title: target.title,
        dayIndex,
        start: newStart,
        duration,
        end: newEnd,
        workersCount: target.workersCount,
        workers: target.workers,
        priority: target.priority || 'normal',
        location: target.location || '',
        machine: target.machine || '',
      })
        return
      }

      if (payload.kind === 'ticket') {
        const alreadyPlanned = scheduledItems.some(
          (i) => i.kind === 'ticket' && (i.ticketId || i.id) === payload.ticketId
        )
        if (alreadyPlanned) return
      } else {
        const alreadyPlanned = scheduledItems.some(
          (i) => i.kind === 'preventiu' && i.templateId === payload.templateId
        )
        if (alreadyPlanned) return
      }
      openModal({
        kind: payload.kind,
        templateId: payload.kind === 'preventiu' ? payload.templateId : null,
        ticketId: payload.kind === 'ticket' ? payload.ticketId : null,
        title: payload.title,
        dayIndex,
        start: startTime,
        duration: payload.minutes,
        end: timeFromMinutes(minutesFromTime(startTime) + payload.minutes),
        workersCount: 1,
        workers: [],
        priority: payload.priority || 'normal',
        location: payload.location || '',
        machine: payload.kind === 'ticket' ? payload.machine || '' : '',
      })
    } catch {
      return
    }
  }

  const handleEdit = (item: ScheduledItem) => {
    const duration = minutesFromTime(item.end) - minutesFromTime(item.start)
      openModal({
        id: item.id,
        kind: item.kind,
        templateId: item.templateId || null,
        ticketId: item.ticketId || (item.kind === 'ticket' ? item.id : null),
        title: item.title,
        dayIndex: item.dayIndex,
        start: item.start,
        duration,
        end: item.end,
        workersCount: item.workersCount,
        workers: item.workers,
        priority: item.priority || 'normal',
        location: item.location || '',
        machine: item.machine || '',
      })
  }

  const handleCreateEmpty = (dayIndex: number, startTime: string) => {
    if (tab !== 'preventius') return
      openModal({
        kind: 'preventiu',
        templateId: null,
        title: '',
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
        }
  ) => {
    openModal({
      kind: item.kind,
      templateId: item.kind === 'preventiu' ? item.id : null,
      ticketId: item.kind === 'ticket' ? item.id : null,
      title: item.title,
      dayIndex: defaultDayIndex,
      start: '08:00',
      duration: item.minutes,
      end: timeFromMinutes(minutesFromTime('08:00') + item.minutes),
      workersCount: 1,
      workers: [],
      priority: item.priority || 'normal',
      location: item.location || '',
      machine: item.kind === 'ticket' ? item.machine || '' : '',
    })
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-none mx-auto p-4 space-y-4">
        <ModuleHeader
          title="Manteniment"
          subtitle="Planificador"
          mainHref="/menu/manteniment"
        />

        <FiltersBar filters={filters} setFilters={setFilters} />

        <div className="space-y-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">DL–DS · Jornada base 08:00–17:00</div>
            <div className="text-xs text-gray-500">Setmana: {weekLabel}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('preventius')}
              className={[
                'min-h-[44px] rounded-full px-4 text-sm font-semibold border',
                tab === 'preventius'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Preventius
            </button>
            <button
              type="button"
              onClick={() => setTab('tickets')}
              className={[
                'min-h-[44px] rounded-full px-4 text-sm font-semibold border',
                tab === 'tickets'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Tickets
            </button>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <div className="text-sm font-semibold text-gray-900">
              {tab === 'preventius' ? 'Pendents per planificar' : 'Tickets pendents'}
            </div>
            <div className="mt-3 space-y-3">
              {tab === 'preventius' &&
                (visibleItems as DueTemplate[]).map((t) => {
                  const alreadyPlanned = scheduledItems.some(
                    (i) => i.kind === 'preventiu' && i.templateId === t.id
                  )
                  return (
                    <div
                      key={t.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        alreadyPlanned ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                      {t.location && <div className="mt-1 text-sm text-gray-500">{t.location}</div>}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            t.dueState === 'overdue'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {t.dueState === 'overdue' ? 'Atencio' : 'Aquesta setmana'}
                        </span>
                        <button
                          type="button"
                          disabled={alreadyPlanned}
                          onClick={() =>
                            openPendingItem({
                              kind: 'preventiu',
                              id: t.id,
                              title: t.name,
                              minutes: 60,
                              location: t.location || '',
                              priority: t.dueState === 'overdue' ? 'alta' : 'normal',
                            })
                          }
                          className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed"
                        >
                          {alreadyPlanned ? 'Ja planificat' : 'Planificar'}
                        </button>
                      </div>
                    </div>
                  )
                })}

              {tab === 'tickets' &&
                (visibleItems as TicketCard[]).map((t) => {
                  const alreadyPlanned = scheduledItems.some(
                    (i) => i.kind === 'ticket' && (i.ticketId || i.id) === t.id
                  )
                  return (
                    <div
                      key={t.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        alreadyPlanned ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="text-sm font-semibold text-gray-900">
                        {t.code} · {t.title}
                      </div>
                      {(t.location || t.createdAt) && (
                        <div className="mt-1 text-sm text-gray-500">
                          {t.location ? `Ubicacio: ${t.location}` : ''}
                          {t.location && t.createdAt ? ' · ' : ''}
                          {t.createdAt ? `Creat: ${formatTicketCreatedAt(t.createdAt)}` : ''}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getAgeBadgeClass(t.ageBucket)}`}>
                            {getAgeLabel(t.ageDays)}
                          </span>
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                            {t.priority}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyPlanned}
                          onClick={() =>
                            openPendingItem({
                              kind: 'ticket',
                              id: t.id,
                              title: `${t.code} - ${t.title}`.trim(),
                              minutes: t.minutes,
                              priority: t.priority,
                              location: t.location || '',
                              machine: t.machine || '',
                            })
                          }
                          className="min-h-[44px] rounded-full border px-4 text-sm font-medium disabled:cursor-not-allowed"
                        >
                          {alreadyPlanned ? 'Ja planificat' : 'Planificar'}
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>

          <div className="space-y-3">
            {days.map((day, dayIndex) => {
              const dayItems = scheduledItems
                .filter((item) => item.dayIndex === dayIndex)
                .sort((a, b) => minutesFromTime(a.start) - minutesFromTime(b.start))
              return (
                <div key={format(day, 'yyyy-MM-dd')} className="rounded-2xl border bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{format(day, 'EEEE dd/MM')}</div>
                      <div className="text-xs text-gray-500">{dayItems.length} tasques</div>
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
                              <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                              <div className="mt-1 text-sm text-gray-600">
                                {item.start} - {item.end}
                                {item.location ? ` · ${item.location}` : ''}
                              </div>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.pill}`}>
                              {PRIORITY_LABEL[priority]}
                            </span>
                          </div>
                          {item.workers.length > 0 && (
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
                          )}
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
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">DL–DS · Jornada base 08:00–17:00</div>
            <div className="text-xs text-gray-500">Setmana: {weekLabel}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('preventius')}
              className={[
                'rounded-full px-4 py-2 text-xs font-semibold border',
                tab === 'preventius'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Preventius
            </button>
            <button
              type="button"
              onClick={() => setTab('tickets')}
              className={[
                'rounded-full px-4 py-2 text-xs font-semibold border',
                tab === 'tickets'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-200',
              ].join(' ')}
            >
              Tickets
            </button>
            {tab === 'preventius' && (
              <>
                <button
                  type="button"
                  onClick={() => setPreventiusFilter('all')}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    preventiusFilter === 'all'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Tots
                </button>
                <button
                  type="button"
                  onClick={() => setPreventiusFilter('due')}
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
                  onClick={() => setPreventiusFilter('overdue')}
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
            {tab === 'tickets' && (
              <>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter('all')}
                  className={[
                    'rounded-full px-3 py-2 text-xs font-semibold border',
                    ticketsAgeFilter === 'all'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-200',
                  ].join(' ')}
                >
                  Tots
                </button>
                <button
                  type="button"
                  onClick={() => setTicketsAgeFilter('today')}
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
                  onClick={() => setTicketsAgeFilter('days_1_2')}
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
                  onClick={() => setTicketsAgeFilter('days_3_7')}
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
                  onClick={() => setTicketsAgeFilter('days_8_plus')}
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
          </div>

          <button
            type="button"
            onClick={() => setShowLegend((v) => !v)}
            className="text-xs text-gray-600 flex items-center gap-1 w-fit"
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

          {showLegend && (
            <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
              <div className="flex flex-wrap items-center gap-3">
                <div className="font-semibold text-gray-900">Tipus</div>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Preventiu
                </span>
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

          <div className="grid grid-cols-[200px_1fr] gap-3">
            <div className="rounded-2xl border bg-white p-3">
              <div className="text-xs font-semibold text-gray-900">
                {tab === 'preventius' ? 'Preventius pendents' : 'Tickets pendents'}
              </div>
              <div className="mt-3 space-y-2">
                {tab === 'preventius' &&
                  (visibleItems as DueTemplate[]).map((t) => {
                    const alreadyPlanned = scheduledItems.some(
                      (i) => i.kind === 'preventiu' && i.templateId === t.id
                    )
                    return (
                      <div
                        key={t.id}
                        className={[
                          'rounded-lg border px-2 py-2 text-[11px] bg-white',
                          alreadyPlanned ? 'opacity-40 cursor-not-allowed' : 'cursor-grab',
                        ].join(' ')}
                        draggable={!alreadyPlanned}
                        title={alreadyPlanned ? 'Ja planificat' : 'Arrossega al calendari'}
                        onDragStart={(e) => {
                          if (alreadyPlanned) return
                          e.dataTransfer.setData(
                            'text/plain',
                            JSON.stringify({
                              type: 'card',
                              kind: 'preventiu',
                              templateId: t.id,
                              title: t.name,
                              minutes: 60,
                              location: t.location || '',
                              priority: t.dueState === 'overdue' ? 'alta' : 'normal',
                            })
                          )
                        }}
                      >
                        <div className="font-semibold text-gray-900 leading-snug">{t.name}</div>
                        {t.location && <div className="text-[10px] text-gray-600">{t.location}</div>}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-600">
                          <span>{t.periodicity || '—'}</span>
                          {t.dueState === 'overdue' ? (
                            <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                              Atencio
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">
                              Aquesta setmana
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                {tab === 'tickets' &&
                  (visibleItems as TicketCard[]).map((t) => {
                    const alreadyPlanned = scheduledItems.some(
                      (i) => i.kind === 'ticket' && (i.ticketId || i.id) === t.id
                    )
                    return (
                      <div
                        key={t.id}
                        className={[
                          'rounded-lg border px-2 py-2 text-[11px] bg-white',
                          alreadyPlanned ? 'opacity-40 cursor-not-allowed' : 'cursor-grab',
                        ].join(' ')}
                        draggable={!alreadyPlanned}
                        title={alreadyPlanned ? 'Ja planificat' : 'Arrossega al calendari'}
                        onDragStart={(e) => {
                          if (alreadyPlanned) return
                          e.dataTransfer.setData(
                            'text/plain',
                            JSON.stringify({
                              type: 'card',
                              kind: 'ticket',
                              ticketId: t.id,
                              title: `${t.code} - ${t.title}`.trim(),
                              minutes: t.minutes,
                              priority: t.priority,
                              location: t.location || '',
                              machine: t.machine || '',
                            })
                          )
                        }}
                      >
                        <div className="font-semibold text-gray-900 leading-snug">
                          {t.code} · {t.title}
                        </div>
                        {(t.location || t.createdAt) && (
                          <div className="mt-1 text-[10px] text-gray-600 leading-snug">
                            {t.location ? `Ubicacio: ${t.location}` : ''}
                            {t.location && t.createdAt ? ' · ' : ''}
                            {t.createdAt ? `Creat: ${formatTicketCreatedAt(t.createdAt)}` : ''}
                          </div>
                        )}
                        <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-gray-600">
                          <span>{t.minutes} min</span>
                          <span className={`rounded-full px-2 py-0.5 ${getAgeBadgeClass(t.ageBucket)}`}>
                            {getAgeLabel(t.ageDays)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-end text-[10px] text-gray-600">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5">{t.priority}</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
              <div className="mt-3 text-[11px] text-gray-500">
                Arrossega cards al calendari i edita hora inici/fi i operari.
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-3 overflow-x-auto relative">
              <div
                className="grid gap-px bg-gray-100 text-xs"
                style={{
                  gridTemplateColumns: `${TIME_COL_WIDTH}px repeat(${DAY_COUNT}, minmax(160px, 1fr))`,
                  gridTemplateRows: `${HEADER_HEIGHT}px repeat(${timeSlots.length - 1}, ${ROW_HEIGHT}px)`,
                }}
              >
                <div className="bg-white" />
                {days.map((d, i) => (
                  <div key={i} className="bg-white px-2 py-2 font-semibold text-gray-700">
                    {format(d, 'EEE dd/MM')}
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
                  const dayItems = scheduledItems
                    .filter((i) => i.dayIndex === colIdx)
                    .map((i) => ({
                      item: i,
                      startMin: minutesFromTime(i.start),
                      endMin: minutesFromTime(i.end),
                    }))
                    .sort((a, b) => a.startMin - b.startMin)

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
                      {positioned.map(({ item, col, group }) => {
                        const rowStart = getRowIndex(item.start)
                        const rowEnd = getRowIndex(item.end)
                        const rows = Math.max(1, rowEnd - rowStart)
                        const height = rows * ROW_HEIGHT + Math.max(0, rows - 1) * GRID_GAP
                        const top = rowStart * (ROW_HEIGHT + GRID_GAP)
                        const columns = Math.max(1, groupMax[group])
                        const widthPercent = 100 / columns
                        const leftPercent = col * widthPercent
                        const priority: NonNullable<ScheduledItem['priority']> =
                          item.priority || 'normal'
                        const tone = getPriorityTone(item.kind, priority)
                        const firstWorker = item.workers[0] || ''
                        const extraWorkers = Math.max(0, item.workers.length - 1)
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
                              {item.title}
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-1">
                              <span
                                className={[
                                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                  tone.pill,
                                ].join(' ')}
                              >
                                {priority === 'urgent' && <AlertTriangle className="h-3 w-3" />}
                                {PRIORITY_LABEL[priority]}
                              </span>
                              {firstWorker && (
                                <span
                                  className={[
                                    'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                                    getWorkerBadgeClass(firstWorker),
                                  ].join(' ')}
                                  title={
                                    extraWorkers > 0
                                      ? `${firstWorker} + ${extraWorkers} mes`
                                      : firstWorker
                                  }
                                >
                                  {getInitials(firstWorker)}
                                  {extraWorkers > 0 ? ` +${extraWorkers}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Disponibilitat: un operari esta lliure si no te cap tasca solapada en aquella franja.
              </div>
            </div>
          </div>
        </div>

        {isModalOpen && draft && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 md:items-center md:p-4">
            <div className="w-full max-w-3xl rounded-t-3xl bg-white shadow-2xl md:rounded-3xl">
              <div className="sticky top-0 rounded-t-3xl border-b border-slate-100 bg-white px-5 pb-4 pt-3 md:px-6">
                <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-slate-200 md:hidden" />
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-gray-900">
                  {draft.title ? draft.title : draft.id ? 'Editar' : 'Nova tasca'}
                  </div>
                  <button
                    type="button"
                    className="min-h-[44px] rounded-full border border-slate-200 px-4 text-sm text-gray-500"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Tancar
                  </button>
                </div>
              </div>

              <div className="max-h-[75vh] overflow-y-auto px-5 py-5 md:px-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Dia</span>
                  <select
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.dayIndex}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              dayIndex: Math.max(
                                0,
                                Math.min(DAY_COUNT - 1, Number(e.target.value) || 0)
                              ),
                            }
                          : d
                      )
                    }
                  >
                    {days.map((day, index) => (
                      <option key={format(day, 'yyyy-MM-dd')} value={index}>
                        {format(day, 'EEEE dd/MM')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Tipus</span>
                  <select
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, kind: e.target.value as any } : d))
                    }
                    disabled={!!draft.id}
                  >
                    <option value="preventiu">Preventiu</option>
                    <option value="ticket">Ticket</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Titol</span>
                  <input
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                    placeholder="Nom del preventiu o ticket"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Hora inici</span>
                  <input
                    type="time"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.start}
                    onChange={(e) => {
                      const start = e.target.value
                      const end = timeFromMinutes(minutesFromTime(start) + draft.duration)
                      setDraft((d) => (d ? { ...d, start, end } : d))
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Durada (min)</span>
                  <input
                    type="number"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.duration}
                    onChange={(e) => {
                      const duration = Math.max(15, Number(e.target.value) || 0)
                      const end = timeFromMinutes(minutesFromTime(draft.start) + duration)
                      setDraft((d) => (d ? { ...d, duration, end } : d))
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Hora fi</span>
                  <input
                    type="time"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.end}
                    onChange={(e) => {
                      const end = e.target.value
                      const duration = minutesFromTime(end) - minutesFromTime(draft.start)
                      setDraft((d) =>
                        d ? { ...d, end, duration: Math.max(15, duration) } : d
                      )
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Nº treballadors</span>
                  <input
                    type="number"
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.workersCount}
                    onChange={(e) =>
                      setDraft((d) =>
                        d ? { ...d, workersCount: Math.max(1, Number(e.target.value) || 1) } : d
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-xs text-gray-600">Assignar treballadors</span>
                  <div className="flex flex-wrap gap-3">
                    {availableWorkers(draft.dayIndex, draft.start, draft.end, draft.id).map((op) => {
                      const checked = draft.workers.includes(op.name)
                      return (
                        <label key={op.id} className="flex min-h-[44px] items-center gap-3 rounded-full border px-4 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setDraft((d) => {
                                if (!d) return d
                                if (checked) {
                                  return { ...d, workers: d.workers.filter((w) => w !== op.name) }
                                }
                                return { ...d, workers: [...d.workers, op.name] }
                              })
                            }}
                          />
                          {op.name}
                        </label>
                      )
                    })}
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Urgencia</span>
                  <select
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, priority: e.target.value as any } : d))
                    }
                  >
                    <option value="urgent">Urgent</option>
                    <option value="alta">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-600">Ubicacio</span>
                  <input
                    className="h-12 rounded-2xl border px-4 text-base"
                    value={draft.location}
                    onChange={(e) => setDraft((d) => (d ? { ...d, location: e.target.value } : d))}
                    placeholder="Sala / zona"
                  />
                </label>
                {draft.kind === 'ticket' && (
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-gray-600">Maquinaria</span>
                    <select
                      className="h-12 rounded-2xl border px-4 text-base"
                      value={draft.machine}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, machine: e.target.value } : d))
                      }
                    >
                      <option value="">Selecciona maquinaria</option>
                      {machines.map((m) => (
                        <option key={`${m.code}-${m.name}`} value={m.label}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              </div>

              {getWorkerConflicts(draft.dayIndex, draft.start, draft.end, draft.workers, draft.id)
                .length > 0 && (
                <div className="mx-5 mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 md:mx-6">
                  Atencio: aquests operaris ja tenen una tasca en aquesta franja:{' '}
                  {getWorkerConflicts(
                    draft.dayIndex,
                    draft.start,
                    draft.end,
                    draft.workers,
                    draft.id
                  ).join(', ')}
                </div>
              )}

              <div className="sticky bottom-0 mt-4 flex items-center justify-between rounded-b-3xl border-t border-slate-100 bg-white px-5 py-4 md:px-6">
                {draft.id ? (
                  <button
                    type="button"
                    title="Eliminar"
                    aria-label="Eliminar"
                    className="rounded-full border border-red-300 p-3 text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      if (!draft?.id) return
                      if (draft.kind === 'preventiu') {
                        try {
                          await fetch(`/api/maintenance/preventius/planned/${draft.id}`, {
                            method: 'DELETE',
                          })
                        } catch {
                          // ignore
                        }
                        setIsModalOpen(false)
                        loadWeekSchedule()
                        return
                      }

                      const ticketId = draft.ticketId || draft.id
                      if (!ticketId) return
                      try {
                        await fetch(`/api/maintenance/tickets/${ticketId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            plannedStart: null,
                            plannedEnd: null,
                            estimatedMinutes: null,
                          }),
                        })
                      } catch {
                        // ignore
                      }
                      setIsModalOpen(false)
                      loadWeekSchedule()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-h-[48px] rounded-full border px-5 text-sm text-gray-600"
                    onClick={() => setIsModalOpen(false)}
                  >
                    Cancel·lar
                  </button>
                  <button
                    type="button"
                    className="min-h-[48px] rounded-full bg-emerald-600 px-6 text-sm font-semibold text-white"
                    onClick={async () => {
                      if (!draft.start || !draft.end) return
                      if (draft.kind === 'ticket') {
                        const ticketId = draft.ticketId || draft.id
                        if (!ticketId) {
                          alert('Arrossega un ticket des de la columna lateral.')
                          return
                        }
                        const nextItem: ScheduledItem = {
                          id: ticketId,
                          kind: 'ticket',
                          ticketId,
                          title: draft.title,
                          workers: draft.workers,
                          workersCount: draft.workersCount,
                          dayIndex: draft.dayIndex,
                          start: draft.start,
                          end: draft.end,
                          minutes: draft.duration,
                          priority: draft.priority,
                          location: draft.location,
                          machine: draft.machine,
                          templateId: null,
                        }
                        setScheduledItems((prev) => {
                          const next = prev.filter((i) => i.id !== ticketId)
                          return [...next, nextItem]
                        })
                        await persistTicketPlanning(nextItem)
                        setIsModalOpen(false)
                        loadWeekSchedule()
                        return
                      }

                      if (!draft.title) {
                        alert('Omple el titol del preventiu.')
                        return
                      }

                      const dateStr = format(addDays(weekStart, draft.dayIndex), 'yyyy-MM-dd')
                      const workerNames = draft.workers || []
                      const workerIds = resolveWorkerIds(workerNames)
                      const payload = {
                        templateId: draft.templateId || null,
                        title: draft.title,
                        date: dateStr,
                        startTime: draft.start,
                        endTime: draft.end,
                        priority: draft.priority,
                        location: draft.location || '',
                        workerNames,
                        workerIds,
                      }

                      try {
                        if (draft.id) {
                          await fetch(`/api/maintenance/preventius/planned/${draft.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          })
                        } else {
                          const res = await fetch('/api/maintenance/preventius/planned', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          })
                          if (!res.ok) throw new Error('create_failed')
                          const json = await res.json().catch(() => null)
                          const newId = json?.id ? String(json.id) : null
                          if (newId) {
                            setScheduledItems((prev) => [
                              ...prev,
                              {
                                id: newId,
                                kind: 'preventiu',
                                templateId: payload.templateId,
                                ticketId: null,
                                title: payload.title,
                                workers: workerNames,
                                workersCount: workerNames.length || 1,
                                dayIndex: draft.dayIndex,
                                start: payload.startTime,
                                end: payload.endTime,
                                minutes: draft.duration,
                                priority: draft.priority,
                                location: payload.location,
                              } as ScheduledItem,
                            ])
                          }
                        }
                      } catch {
                        alert('No s’ha pogut guardar el preventiu.')
                      }
                      setIsModalOpen(false)
                      loadWeekSchedule()
                    }}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}

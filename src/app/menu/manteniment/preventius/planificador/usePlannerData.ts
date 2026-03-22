'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import type { DueTemplate, ScheduledItem, Template, TicketCard } from './types'
import type { Ticket } from '@/app/menu/manteniment/tickets/types'
import {
  findAutoPlanSlot,
  findAvailablePreventiuSlot,
  resolveTemplateWorkerNames,
} from './autoPlanning'
import {
  PRIORITY_WEIGHT,
  calculateNextDue,
  getAgeBucket,
  getAgeDays,
  minutesFromTime,
  normalizeName,
  parseStoredDate,
  timeFromMinutes,
} from './utils'

type UsePlannerDataArgs = {
  weekStart: Date
  dayCount: number
  tab: 'preventius' | 'tickets'
  preventiusFilter: 'all' | 'due' | 'overdue'
  ticketsAgeFilter: 'all' | 'today' | 'days_1_2' | 'days_3_7' | 'days_8_plus'
}

export default function usePlannerData({
  weekStart,
  dayCount,
  tab,
  preventiusFilter,
  ticketsAgeFilter,
}: UsePlannerDataArgs) {
  const isLoadingWeekRef = useRef(false)
  const pendingReloadRef = useRef(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [realTickets, setRealTickets] = useState<TicketCard[]>([])
  const [ticketById, setTicketById] = useState<Record<string, Ticket>>({})
  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<Array<{ code: string; name: string; label: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string; department?: string }>>([])
  const [scheduledItems, setScheduledItems] = useState<ScheduledItem[]>([])

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
        return {
          ...template,
          dueState: due.getTime() < weekStartDay.getTime() ? 'overdue' : 'due',
          dueDate: format(due, 'yyyy-MM-dd'),
        }
      })
  }, [templates, weekStart, dayCount])

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
        const lookup = list.reduce<Record<string, Ticket>>((acc, ticket) => {
          if (!ticket?.id) return acc
          acc[String(ticket.id)] = ticket as Ticket
          return acc
        }, {})
        setTicketById(lookup)
        const mapped = list
          .filter((t: any) => !t.externalized)
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
    void loadTickets()
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
            autoPlanExcludedWeeks: Array.isArray(t.autoPlanExcludedWeeks)
              ? t.autoPlanExcludedWeeks.map(String)
              : [],
          }))
        setTemplates(mapped)
      } catch {
        setTemplates([])
      }
    }
    void loadTemplates()
  }, [])

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const res = await fetch('/api/spaces/internal', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        setLocations(Array.isArray(json?.locations) ? json.locations : [])
      } catch {
        setLocations([])
      }
    }
    void loadLocations()
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
    void loadMachines()
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
    void loadUsers()
  }, [])

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
    if (isLoadingWeekRef.current) {
      pendingReloadRef.current = true
      return
    }
    isLoadingWeekRef.current = true
    pendingReloadRef.current = false
    const startStr = format(weekStart, 'yyyy-MM-dd')
    const endStr = format(addDays(weekStart, dayCount - 1), 'yyyy-MM-dd')
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
          }
        })
        .filter(Boolean) as ScheduledItem[]

      const ticketsJson = ticketsRes.ok ? await ticketsRes.json() : { tickets: [] }
      const ticketList = Array.isArray(ticketsJson?.tickets) ? ticketsJson.tickets : []
      const nextTicketById = ticketList.reduce<Record<string, Ticket>>((acc, ticket) => {
        if (!ticket?.id) return acc
        acc[String(ticket.id)] = ticket as Ticket
        return acc
      }, {})
      setTicketById(nextTicketById)
      const ticketsMapped: ScheduledItem[] = ticketList
        .filter((t: any) => !t.externalized)
        .filter((t: any) => t.plannedStart && t.plannedEnd)
        .map((t: any) => {
          const start = new Date(Number(t.plannedStart))
          const end = new Date(Number(t.plannedEnd))
          const date = format(start, 'yyyy-MM-dd')
          if (date < startStr || date > endStr) return null
          const dayIndex = Math.round((parseISO(date).getTime() - weekStart.getTime()) / 86400000)
          if (dayIndex < 0 || dayIndex >= dayCount) return null
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
            priority: (t.priority || 'normal') as ScheduledItem['priority'],
            location: String(t.location || ''),
            machine: String(t.machine || ''),
            createdAt: t.createdAt || null,
            templateId: null,
            ticketId: String(t.id || ''),
          }
        })
        .filter(Boolean) as ScheduledItem[]

      const workingPreventius = [...plannedMapped]
      const workingAgenda: ScheduledItem[] = [...plannedMapped, ...ticketsMapped]
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

        const preferredSlot = findAvailablePreventiuSlot(workingAgenda, {
          minutes: item.minutes,
          workers: desiredWorkers,
          firstDayIndex: item.dayIndex,
          ignoreId: item.id,
          normalizeName,
          minutesFromTime,
          timeFromMinutes,
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
          const agendaIndex = workingAgenda.findIndex((entry) => entry.id === item.id)
          if (agendaIndex >= 0) workingAgenda[agendaIndex] = nextItem
        } catch {
          continue
        }
      }

      for (const template of dueTemplates) {
        if (alreadyPlannedTemplateIds.has(template.id)) continue
        if ((template.autoPlanExcludedWeeks || []).includes(format(weekStart, "yyyy-'W'II"))) continue

        const slot = findAutoPlanSlot(workingAgenda, template, {
          weekStart,
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
          }
          workingPreventius.push(nextItem)
          workingAgenda.push(nextItem)
          alreadyPlannedTemplateIds.add(template.id)
        } catch {
          continue
        }
      }

      setScheduledItems([...workingPreventius, ...ticketsMapped])
    } catch {
      setScheduledItems([])
    } finally {
      isLoadingWeekRef.current = false
      if (pendingReloadRef.current) {
        pendingReloadRef.current = false
        void loadWeekSchedule()
      }
    }
  }, [dayCount, dueTemplates, resolveWorkerIds, templates, weekStart])

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
      scheduledItems.forEach((item) => {
        if (ignoreId && item.id === ignoreId) return
        if (item.dayIndex !== dayIndex) return
        const s = minutesFromTime(item.start)
        const e = minutesFromTime(item.end)
        const overlaps = startMin < e && endMin > s
        if (!overlaps) return
        item.workers.forEach((worker) => {
          if (workers.includes(worker)) conflicts.add(worker)
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
          .filter((u) => normalizeName(u.department || '').includes('manten'))
          .map((u) => ({ id: u.id, name: u.name })) || []
      const list = operators.length > 0 ? operators : users.map((u) => ({ id: u.id, name: u.name }))
      return list.filter((op) => {
        const has = scheduledItems.some((item) => {
          if (ignoreId && item.id === ignoreId) return false
          if (item.dayIndex !== dayIndex) return false
          const s = minutesFromTime(item.start)
          const e = minutesFromTime(item.end)
          const startMin = minutesFromTime(start)
          const endMin = minutesFromTime(end)
          const overlaps = startMin < e && endMin > s
          return overlaps && item.workers.includes(op.name)
        })
        return !has
      })
    },
    [scheduledItems, users]
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
          location: item.location || undefined,
          machine: item.machine || undefined,
          assignedToNames: assignedToNames.length ? assignedToNames : undefined,
          assignedToIds: assignedToIds.length ? assignedToIds : undefined,
        }),
      })

      if (!res.ok) {
        throw new Error('ticket_planning_failed')
      }
    },
    [resolveWorkerIds, weekStart]
  )

  const legendWorkers = useMemo(() => {
    const unique = new Set<string>()
    scheduledItems.forEach((item) => item.workers.forEach((worker) => unique.add(worker)))
    return Array.from(unique).sort((a, b) => a.localeCompare(b)).slice(0, 10)
  }, [scheduledItems])

  return {
    locations,
    machines,
    users,
    ticketById,
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

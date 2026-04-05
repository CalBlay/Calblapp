'use client'

import React, { useMemo, useState } from 'react'
import { addDays, endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { ca } from 'date-fns/locale'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { RoleGuard } from '@/lib/withRoleGuard'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import { typography } from '@/lib/typography'
import type { PlannerDraft, ScheduledItem } from './types'
import {
  PRIORITY_LABEL,
  getInitials,
  getPriorityTone,
  getWorkerBadgeClass,
  minutesFromTime,
  normalizeName,
  timeFromMinutes,
} from './utils'
import PlannerSidebar from './components/PlannerSidebar'
import PlannerEditModal from './components/PlannerEditModal'
import PlannerTicketModal from './components/PlannerTicketModal'
import usePlannerData from './usePlannerData'

const ROW_HEIGHT = 40
const GRID_GAP = 1
const HEADER_HEIGHT = 32
const TIME_COL_WIDTH = 80
const DAY_COUNT = 6

function normalizePlannerTicketStatus(value?: string | null) {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut' || v === 'validat') return 'validat'
  return 'nou'
}

export default function PreventiusPlanificadorPage() {
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
  const [showLegend, setShowLegend] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [draft, setDraft] = useState<PlannerDraft | null>(null)

  const setFilters = (partial: Partial<FiltersState>) =>
    setFiltersState((prev) => ({ ...prev, ...partial }))

  const weekStart = useMemo(() => parseISO(filters.start), [filters.start])
  const weekLabel = format(weekStart, "yyyy-'W'II")
  const selectedWorker = String(filters.responsable || '__all__')
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )
  const daySidebarLabels = useMemo(
    () => days.map((d) => format(d, 'EEE dd/MM', { locale: ca })),
    [days]
  )
  const {
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
  } = usePlannerData({
    weekStart,
    dayCount: DAY_COUNT,
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

  const filteredScheduledItems = useMemo(() => {
    if (!selectedWorker || selectedWorker === '__all__') return scheduledItems
    const normalizedSelected = normalizeName(selectedWorker)
    return scheduledItems.filter((item) =>
      item.workers.some((worker) => normalizeName(worker) === normalizedSelected)
    )
  }, [scheduledItems, selectedWorker])

  const scheduledItemsByDay = useMemo(() => {
    const grouped = new Map<number, ScheduledItem[]>()
    filteredScheduledItems.forEach((item) => {
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
  }, [filteredScheduledItems])

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

        setScheduledItems((prev) =>
          prev.map((item) => (item.id === target.id ? movedItem : item))
        )

        try {
          if (target.kind === 'ticket') {
            await persistTicketPlanning(movedItem)
          } else {
            const dateStr = format(addDays(weekStart, dayIndex), 'yyyy-MM-dd')
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
        const dateStr = format(addDays(weekStart, dayIndex), 'yyyy-MM-dd')
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
      templateId: item.templateId || null,
      ticketId: item.ticketId || (item.kind === 'ticket' ? item.id : null),
      title: item.title,
      createdAt: item.createdAt || null,
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
          createdAt?: string | number | null
        }
  ) => {
    openModal({
      kind: item.kind,
      templateId: item.kind === 'preventiu' ? item.id : null,
      ticketId: item.kind === 'ticket' ? item.id : null,
      title: item.title,
      createdAt: item.kind === 'ticket' ? item.createdAt || null : null,
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
        if (!['nou', 'assignat', 'no_fet'].includes(status)) {
          window.alert('Només pots tornar a pendents preventius en estat Nou, Assignat o No fet.')
          await loadWeekSchedule()
          return
        }
      }

      setScheduledItems((prev) => prev.filter((item) => item.id !== target.id))

      if (target.kind === 'preventiu') {
        await unplanPreventiu(target.id, target.templateId)
      } else {
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
    const current = ticketById[ticketId]
    const status = normalizePlannerTicketStatus(current?.status)

    if (!['nou', 'assignat', 'no_fet'].includes(status)) {
      window.alert('Només pots tornar a pendents tickets en estat Nou, Assignat o No fet.')
      await loadWeekSchedule()
      return false
    }

    const nextStatus = status === 'no_fet' ? 'no_fet' : 'nou'
    const res = await fetch(`/api/maintenance/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: nextStatus,
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

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap']}>
      <div className="w-full max-w-none mx-auto p-4 space-y-4">
        <ModuleHeader
          title="Manteniment"
          subtitle="Planificador"
          mainHref="/menu/manteniment"
        />

        <FiltersBar
          filters={filters}
          setFilters={setFilters}
          responsables={workerOptions}
        />

        <div className="space-y-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className={typography('bodyXs')}>DL-DS · Jornada base 08:00-17:00</div>
            <div className={typography('bodyXs')}>Setmana: {weekLabel}</div>
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

          <PlannerSidebar
            tab={tab}
            visibleItems={visibleItems}
            scheduledItems={scheduledItems}
            dayLabels={daySidebarLabels}
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
            <button
              type="button"
              onClick={() => setShowLegend((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-gray-600"
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

          <div className="grid h-[calc(100vh-250px)] min-h-[620px] grid-cols-[200px_1fr] gap-3">
              <PlannerSidebar
                tab={tab}
                visibleItems={visibleItems}
                scheduledItems={scheduledItems}
                dayLabels={daySidebarLabels}
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
                    gridTemplateRows: `${HEADER_HEIGHT}px repeat(${timeSlots.length - 1}, ${ROW_HEIGHT}px)`,
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
                          const visibleWorkers = item.workers.slice(0, 2)
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
                              {item.location && (
                                <div className="mt-1 line-clamp-1 text-[10px] text-gray-600">
                                  {item.location}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1">
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
                Disponibilitat: un operari esta lliure si no te cap tasca solapada en aquella franja.
              </div>
            </div>
          </div>
        </div>

        {isModalOpen && draft && draft.kind === 'ticket' && draft.ticketId && (
          <PlannerTicketModal
            ticketId={draft.ticketId}
            initialDate={format(addDays(weekStart, draft.dayIndex), 'yyyy-MM-dd')}
            initialStartTime={draft.start}
            initialDurationMinutes={draft.duration}
            initialTicket={ticketById[draft.ticketId] || null}
            locations={locations}
            machines={machines}
            users={users}
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
            dayCount={DAY_COUNT}
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
            weekStart={weekStart}
            persistTicketPlanning={persistTicketPlanning}
            loadWeekSchedule={loadWeekSchedule}
            onUnplanPreventiu={unplanPreventiu}
            onUnplanTicket={unplanTicket}
          />
        )}
      </div>
    </RoleGuard>
  )
}

'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { useSession } from 'next-auth/react'
import type { FiltersState } from '@/components/layout/FiltersBar'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import { useQuadrantsPageData } from '@/app/menu/quadrants/hooks/useQuadrantsPageData'
import type { UnifiedEvent } from '@/app/menu/quadrants/types'
import type { Draft } from '@/app/menu/quadrants/drafts/page'
import { groupQuadrantsByDay, groupQuadrantsByDayAndEvent } from '@/lib/quadrantsGrouping'
import {
  findPhaseByPendingExpandKey,
  isPendingExpandKey,
} from '@/lib/buildPendingQuadrantDraft'
import { useQuadrantMutationListeners } from '@/app/menu/quadrants/hooks/useQuadrantMutationListeners'

const LOGISTIC_PHASE_OPTIONS = [
  { key: 'event', label: 'Event' },
  { key: 'entrega', label: 'Entrega' },
  { key: 'recollida', label: 'Recollida' },
]

const SERVICE_PHASE_OPTIONS = [
  { key: 'event', label: 'Event' },
  { key: 'muntatge', label: 'Muntatge' },
]

const CUINA_PHASE_OPTIONS = [{ key: 'event', label: 'Event' }]

type DashboardResponse = {
  events?: QuadrantEvent[]
  quadrants?: Draft[]
  surveyKeys?: string[]
}

type SessionDepartmentSource = {
  department?: string
  dept?: string
}

type QuadrantsPageDataInput = Parameters<typeof useQuadrantsPageData>[0]

const fetchDashboard = async (url: string): Promise<DashboardResponse> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useQuadrantsDashboardPage() {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 })
  const end = endOfWeek(new Date(), { weekStartsOn: 1 })

  const [filters, setFilters] = useState<FiltersState>(() => ({
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    mode: 'week',
    ln: 'all',
    responsable: '__all__',
    location: '__all__',
    status: '__all__',
  }))
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: session } = useSession()
  const sessionUser = session?.user as SessionDepartmentSource | undefined
  const department = (sessionUser?.department || sessionUser?.dept || 'serveis')
    .toString()
    .toLowerCase()
  const isCuinaDepartment = department === 'cuina'
  const [hideCuinaMinorServices, setHideCuinaMinorServices] = useState(isCuinaDepartment)

  useEffect(() => {
    setHideCuinaMinorServices(isCuinaDepartment)
  }, [isCuinaDepartment])

  const dashboardUrl = useMemo(() => {
    const params = new URLSearchParams({
      department,
      start: filters.start,
      end: filters.end,
    })
    return `/api/quadrants/dashboard?${params.toString()}`
  }, [department, filters.end, filters.start])

  const {
    data: dashboardData,
    error,
    isLoading: loading,
    mutate: reload,
  } = useSWR<DashboardResponse>(dashboardUrl, fetchDashboard)

  const events = useMemo(
    () => (Array.isArray(dashboardData?.events) ? dashboardData.events : []),
    [dashboardData?.events]
  ) as QuadrantEvent[]

  const quadrants = useMemo<QuadrantsPageDataInput['quadrants']>(
    () =>
      (Array.isArray(dashboardData?.quadrants) ? dashboardData.quadrants : []).map((item) => ({
        ...item,
        phaseType: item.phaseType ?? undefined,
        phaseLabel: item.phaseLabel ?? undefined,
      })) as unknown as QuadrantsPageDataInput['quadrants'],
    [dashboardData?.quadrants]
  )

  const surveyKeys = useMemo(
    () => (Array.isArray(dashboardData?.surveyKeys) ? dashboardData.surveyKeys : []),
    [dashboardData?.surveyKeys]
  )

  useQuadrantMutationListeners(reload)

  const surveyKeySet = useMemo(() => new Set(surveyKeys), [surveyKeys])

  const { filteredEvents, phasesByEventId } = useQuadrantsPageData({
    events,
    quadrants,
    filters,
  })

  const normalizeForFilter = (value?: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

  const shouldHideCuinaEvent = useCallback(
    (ev: UnifiedEvent) => {
      if (!isCuinaDepartment || !hideCuinaMinorServices) return false
      const service = normalizeForFilter(ev.service)
      const pax = Number(ev.numPax ?? NaN)
      return (
        service.includes('coffee') ||
        (service.includes('menu') && service.includes('entregues')) ||
        (service.includes('cheers') && Number.isFinite(pax) && pax < 200)
      )
    },
    [hideCuinaMinorServices, isCuinaDepartment]
  )

  const visibleFilteredEvents = useMemo(
    () => filteredEvents.filter((ev) => !shouldHideCuinaEvent(ev)),
    [filteredEvents, shouldHideCuinaEvent]
  )

  useEffect(() => {
    if (!expandedId || !isPendingExpandKey(expandedId)) return
    const phase = findPhaseByPendingExpandKey(expandedId, visibleFilteredEvents)
    const draftId = (phase?.draft as { id?: string } | undefined)?.id
    if (draftId) setExpandedId(draftId)
  }, [visibleFilteredEvents, expandedId])

  const groupedDays = useMemo(
    () => groupQuadrantsByDayAndEvent(visibleFilteredEvents),
    [visibleFilteredEvents]
  )

  const groupedLines = useMemo(
    () => groupQuadrantsByDay(visibleFilteredEvents),
    [visibleFilteredEvents]
  )

  const visibleCounts = useMemo(() => {
    let pending = 0
    let draft = 0
    let confirmed = 0
    visibleFilteredEvents.forEach((ev) => {
      if (ev.quadrantStatus === 'draft') draft += 1
      else if (ev.quadrantStatus === 'confirmed') confirmed += 1
      else pending += 1
    })
    return { pending, draft, confirmed }
  }, [visibleFilteredEvents])

  const responsables = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev) => {
      if (ev.responsable) set.add(ev.responsable.toString().trim().toLowerCase())
    })
    return Array.from(set).sort()
  }, [events])

  const locations = useMemo(() => {
    const set = new Set<string>()
    events.forEach((ev) => {
      if (ev.location) set.add(ev.location.toString().trim().toLowerCase())
    })
    return Array.from(set).sort()
  }, [events])

  const phaseOptions = useMemo(() => {
    if (department === 'cuina') return CUINA_PHASE_OPTIONS
    if (department === 'serveis') return SERVICE_PHASE_OPTIONS
    return LOGISTIC_PHASE_OPTIONS
  }, [department])

  const resetFilters = useCallback(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    setDateResetSignal((n) => n + 1)
    setFilters({
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      mode: 'week',
      ln: 'all',
      responsable: '__all__',
      location: '__all__',
      status: '__all__',
    })
  }, [])

  const toggleStatusFilter = useCallback((status: 'pending' | 'draft' | 'confirmed') => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status === status ? '__all__' : status,
    }))
  }, [])

  return {
    department,
    filters,
    setFilters,
    dateResetSignal,
    setDateResetSignal,
    expandedId,
    setExpandedId,
    loading,
    error,
    reload,
    surveyKeySet,
    phasesByEventId,
    visibleFilteredEvents,
    groupedDays,
    groupedLines,
    visibleCounts,
    responsables,
    locations,
    phaseOptions,
    resetFilters,
    toggleStatusFilter,
    isCuinaDepartment,
    hideCuinaMinorServices,
    setHideCuinaMinorServices,
    totalVisible: visibleFilteredEvents.length,
    statusFilterActive: filters.status !== '__all__',
    hasContent: groupedDays.length > 0,
  }
}

'use client'

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import { useQuadrantFormState } from '../hooks/useQuadrantFormState'
import LogisticsPhasePanel from './LogisticsPhasePanel'
import ServicePhasePanel from './ServicePhasePanel'
import { normalizeTransportType } from '@/lib/transportTypes'
import { normalizeRole } from '@/lib/roles'
import GenerationScopeToggle from './GenerationScopeToggle'
import SurveyLaunchPanel from './SurveyLaunchPanel'
import CuinaSection from './CuinaSection'

const surveyPremisesCache = new Map<string, Array<{ id: string; name: string; workerIds: string[] }>>()
const surveyPeopleCache = new Map<string, Array<{ id: string; name: string }>>()
const surveyPeoplePromiseCache = new Map<string, Promise<Array<{ id: string; name: string }>>>()

const extractDate = (iso = '') => iso.split('T')[0] || ''

const parseEventCode = (title = ''): string => {
  const t = String(title || '')
  const mHash = t.match(/#\s*([A-Z]{1,2}\d{5,})\b/i)
  if (mHash) return mHash[1].toUpperCase()
  const all = [...t.matchAll(/\b([A-Z]{1,2}\d{5,})\b/gi)]
  if (all.length) return all[all.length - 1][1].toUpperCase()
  return ''
}

const splitTitle = (title = '') => {
  const code = parseEventCode(title)
  let name = title
  if (code) {
    name = name.replace(new RegExp(`([\\-â€“â€”#]\s*)?${code}\s*$`, 'i'), '').trim()
  }
  return { name: name.trim(), code }
}

const normalizeTime = (value?: string) => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

const collectTimetable = (entry: { startTime?: string; endTime?: string }) => {
  const start = normalizeTime(entry.startTime)
  const end = normalizeTime(entry.endTime)
  if (start && end) return { startTime: start, endTime: end }
  return null
}

const makeGroupId = () => `group-${Date.now()}-${Math.random().toString(16).slice(2)}`

type QuadrantModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: QuadrantEvent
}

type CuinaGroup = {
  id: string
  meetingPoint: string
  startTime: string
  arrivalTime: string
  endTime: string
  workers: number
  drivers: number
  needsDriver: boolean
  wantsResponsible: boolean
  responsibleId: string
  driverMode: string
  vehicleType: string
}

type TimetableEntry = {
  startTime?: string
  endTime?: string
}

type GenerationScope = 'day' | 'event'

const getDateRange = (startIso?: string, endIso?: string) => {
  const safeStart = extractDate(startIso || '')
  if (!safeStart) return []

  try {
    const start = parseISO(startIso || safeStart)
    const end = parseISO(endIso || startIso || safeStart)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return [safeStart]
    }

    const totalDays = Math.max(differenceInCalendarDays(end, start), 0)
    return Array.from({ length: totalDays + 1 }, (_, index) =>
      format(addDays(start, index), 'yyyy-MM-dd')
    )
  } catch {
    return [safeStart]
  }
}

const clonePayloadForDate = (
  payload: Record<string, unknown>,
  department: string,
  date: string
): Record<string, unknown> => {
  const nextPayload: Record<string, unknown> = {
    ...payload,
    startDate: date,
    endDate: date,
    phaseDate: date,
    phaseType: (payload.phaseType as string) || 'event',
    phaseLabel: (payload.phaseLabel as string) || 'Event',
    generationScope: 'event',
  }

  if (Array.isArray(payload.groups)) {
    nextPayload.groups = payload.groups.map((group: any) => ({
      ...group,
      serviceDate: department === 'serveis' ? date : group?.serviceDate ?? date,
    }))
  }

  if (Array.isArray(payload.externalWorkers)) {
    nextPayload.externalWorkers = payload.externalWorkers.map((worker: any) => ({
      ...worker,
      startDate: date,
      endDate: date,
    }))
  }

  if (Array.isArray(payload.logisticaPhases)) {
    nextPayload.logisticaPhases = payload.logisticaPhases.map((phase: any) => ({
      ...phase,
      date,
      endDate: date,
    }))
  }

  return nextPayload
}

const buildPreferredAssignments = (proposal?: {
  responsible?: { name?: string | null } | null
  drivers?: Array<{ name?: string | null }>
  staff?: Array<{ name?: string | null }>
} | null) => {
  if (!proposal) return null

  const preferredResponsibleName = String(proposal.responsible?.name || '').trim()
  const preferredDriverNames = Array.isArray(proposal.drivers)
    ? proposal.drivers.map((driver) => String(driver?.name || '').trim()).filter(Boolean)
    : []
  const preferredStaffNames = Array.isArray(proposal.staff)
    ? proposal.staff
        .map((member) => String(member?.name || '').trim())
        .filter((name) => Boolean(name) && name !== 'Extra')
    : []

  return {
    preferredResponsibleName: preferredResponsibleName || null,
    preferredDriverNames,
    preferredStaffNames,
  }
}

const submitQuadrantPayload = async (payload: Record<string, unknown>) => {
  const res = await fetch('/api/quadrants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  const data = JSON.parse(text)

  if (!res.ok || (data as any)?.ok === false || (data as any)?.success === false) {
    throw new Error((data as any)?.error || 'Error desant el quadrant')
  }

  return data as {
    proposal?: {
      responsible?: { name?: string | null } | null
      drivers?: Array<{ name?: string | null }>
      staff?: Array<{ name?: string | null }>
    }
    meta?: {
      needsReview?: boolean
      violations?: string[]
      notes?: string[]
    }
  }
}

const toastAutoAssignDoubleBookingWarnings = (data: {
  meta?: {
    needsReview?: boolean
    violations?: string[]
    notes?: string[]
  }
}) => {
  const meta = data?.meta
  const notes = Array.isArray(meta?.notes) ? meta!.notes!.filter(Boolean) : []
  if (notes.length === 0) return
  const hasDouble =
    Array.isArray(meta?.violations) && meta!.violations!.includes('person_double_booked')
  const hasOverlapNote = notes.some((n) => String(n).includes('ja està assignat'))
  if (!hasDouble && !hasOverlapNote) return
  const preview = notes.slice(0, 5).join('\n')
  toast.warning('Atenció: possible solapament de personal', {
    description: preview,
    duration: 16_000,
  })
}

type CuinaEttState = {
  open: boolean
  data: {
    serviceDate: string
    meetingPoint: string
    startTime: string
    endTime: string
    workers: string
  }
}

export default function QuadrantModal({ open, onOpenChange, event }: QuadrantModalProps) {
  const { data: session } = useSession()
  const userRole = normalizeRole(String((session?.user as any)?.role || ''))
  const department = (
    session?.user?.department ||
    (session as any)?.department ||
    (session as any)?.dept ||
    'serveis'
  )
    .toString()
    .toLowerCase()
  const isCuina = department === 'cuina'
  const isServeis = department === 'serveis'
  const isLogistica = department === 'logistica'
  const isGroupDept = isCuina || isServeis

  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    arrivalTime,
    setArrivalTime,
    location,
    setLocation,
    meetingPoint,
    setMeetingPoint,
    manualResp,
    setManualResp,
    totalWorkers,
    setTotalWorkers,
    numDrivers,
    setNumDrivers,
    phaseForms,
    updatePhaseForm,
    phaseVisibility,
    togglePhaseVisibility,
    phaseSettings,
    updatePhaseSetting,
    phaseResponsibles,
    updatePhaseResponsible,
    phaseVehicleAssignments,
    updatePhaseVehicleAssignment,
    availableVehicles,
    servicePhaseGroups,
    servicePhaseSettings,
    toggleServicePhaseSelection,
    updateServicePhaseSetting,
    servicePhaseVisibility,
    toggleServicePhaseVisibility,
    addServiceGroup,
    updateServiceGroup,
    removeServiceGroup,
    servicePhaseEtt,
    toggleServicePhaseEtt,
    updateServicePhaseEtt,
    ettOpen,
    setEttOpen,
    ettData,
    setEttData,
    serviceTotals,
    serviceJamoneroAssignments,
    setServiceJamoneroCount,
    updateServiceJamoneroAssignment,
    buildServiceGroupsPayload,
    vehiclesPayload,
    buildLogisticaPhases,
    ettEntry,
    availableResponsables,
    availableConductors,
    availableJamoneros,
  } = useQuadrantFormState({ event, department, modalOpen: open })

  const rawTitle = event.summary || event.title || ''
  const { name: eventName, code: parsedCode } = splitTitle(rawTitle)
  const eventCode = parsedCode || (rawTitle.match(/[A-Z]\d{6,}/)?.[0] ?? '').toUpperCase()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [generationScope, setGenerationScope] = useState<GenerationScope>('day')
  const [surveyGroupsLoading, setSurveyGroupsLoading] = useState(false)
  const [surveyPeopleLoading, setSurveyPeopleLoading] = useState(false)
  const [surveyLoading, setSurveyLoading] = useState(false)
  const [surveySubmitting, setSurveySubmitting] = useState(false)
  const [surveyGroups, setSurveyGroups] = useState<Array<{ id: string; name: string; workerIds: string[] }>>([])
  const [surveyPeople, setSurveyPeople] = useState<Array<{ id: string; name: string }>>([])
  const [selectedSurveyGroupIds, setSelectedSurveyGroupIds] = useState<string[]>([])
  const [selectedSurveyWorkerIds, setSelectedSurveyWorkerIds] = useState<string[]>([])
  const [surveyDeadlineTime, setSurveyDeadlineTime] = useState('18:00')
  const [surveys, setSurveys] = useState<
    Array<{
      id: string
      serviceDate: string
      status: string
      createdByName?: string
      deadlineAt?: number
      targetGroupNames?: string[]
      targetWorkerNames?: string[]
      resolvedTargets?: Array<{ name: string }>
      counts?: { yes: number; no: number; maybe: number; pending: number; withoutAnswer?: number }
      responses?: Array<{ workerName: string; response: 'yes' | 'no' | 'maybe'; respondedAt: number }>
      responseGroups?: {
        yes: Array<{ workerName: string; respondedAt: number }>
        maybe: Array<{ workerName: string; respondedAt: number }>
        no: Array<{ workerName: string; respondedAt: number }>
        pending: Array<{ workerName: string }>
        withoutAnswer?: Array<{ workerName: string }>
      }
    }>
  >([])
  const visibleDate = extractDate(event.start)
  const surveyEventStartAt = useMemo(() => {
    const baseDate = visibleDate || extractDate(event.originalStart || event.start)
    const baseTime = startTime || event.startTime || '00:00'
    const parsed = new Date(`${baseDate}T${baseTime}:00`)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }, [event.originalStart, event.start, event.startTime, startTime, visibleDate])
  const latestAllowedSurveyDeadlineAt = useMemo(() => {
    if (!surveyEventStartAt) return null
    return new Date(surveyEventStartAt.getTime() - 48 * 60 * 60 * 1000)
  }, [surveyEventStartAt])
  const latestAllowedSurveyDeadlineDate = latestAllowedSurveyDeadlineAt
    ? format(latestAllowedSurveyDeadlineAt, 'yyyy-MM-dd')
    : ''
  const latestAllowedSurveyDeadlineTime = latestAllowedSurveyDeadlineAt
    ? format(latestAllowedSurveyDeadlineAt, 'HH:mm')
    : ''
  const [surveyDeadlineDate, setSurveyDeadlineDate] = useState('')
  const [serveisVestimentModels, setServeisVestimentModels] = useState<string[]>([])
  const [vestimentModelChoice, setVestimentModelChoice] = useState<string>('__none__')
  const eventRangeStart = extractDate(event.originalStart || event.start)
  const eventRangeEnd = extractDate(event.originalEnd || event.end || event.start)
  const multiDayDates = useMemo(
    () => getDateRange(event.originalStart || event.start, event.originalEnd || event.end || event.start),
    [event.end, event.originalEnd, event.originalStart, event.start]
  )
  const isMultiDayEvent = multiDayDates.length > 1
  const canLaunchSurvey = userRole === 'admin' || userRole === 'direccio' || userRole === 'cap'
  const createCuinaGroup = (seed: Partial<CuinaGroup> = {}): CuinaGroup => {
    const seedDrivers = Math.max(0, (seed.drivers ?? Number(numDrivers)) || 0)
    const needsDriver = seed.needsDriver ?? seedDrivers > 0

    return {
      id: seed.id || makeGroupId(),
      meetingPoint: seed.meetingPoint || meetingPoint || 'CENTRAL',
      startTime: seed.startTime ?? startTime ?? '',
      arrivalTime: seed.arrivalTime ?? arrivalTime ?? '',
      endTime: seed.endTime ?? endTime ?? '',
      workers: (seed.workers ?? Number(totalWorkers)) || 0,
      drivers: seedDrivers,
      needsDriver,
      wantsResponsible: seed.wantsResponsible ?? true,
      responsibleId: seed.responsibleId ?? '',
      driverMode: seed.driverMode ?? '__auto__',
      vehicleType: seed.vehicleType ?? '',
    }
  }

  const [cuinaGroups, setCuinaGroups] = useState<CuinaGroup[]>(() => [createCuinaGroup()])
  const [cuinaEtt, setCuinaEtt] = useState<CuinaEttState>(() => ({
    open: false,
    data: {
      serviceDate: extractDate(event.start),
      meetingPoint: 'CENTRAL',
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      workers: '',
    },
  }))
  const cuinaTotalsRef = useRef({ workers: Number(totalWorkers) || 0, drivers: Number(numDrivers) || 0 })

  const cuinaTotals = useMemo(
    () => ({
      workers: cuinaGroups.reduce((sum, group) => sum + group.workers, 0),
      drivers: cuinaGroups.reduce((sum, group) => sum + group.drivers, 0),
      responsables: cuinaGroups.filter((group) => group.wantsResponsible).length,
    }),
    [cuinaGroups]
  )

  const isManualResponsibleConductor = useMemo(() => {
    if (!manualResp || manualResp === '__auto__') return false
    return availableConductors.some((conductor) => conductor.id === manualResp)
  }, [availableConductors, manualResp])

  const cuinaVehiclesPayload = useMemo(
    () =>
      cuinaGroups
        .filter((group) => Number(group.drivers || 0) > 0)
        .map((group) => {
          let conductorId: string | null = null
          if (group.driverMode === '__responsable__') {
            conductorId =
              group.responsibleId ||
              (manualResp && manualResp !== '__auto__' ? manualResp : null)
          } else if (group.driverMode && group.driverMode !== '__auto__') {
            conductorId = group.driverMode
          }

          return {
            id: '',
            plate: '',
            vehicleType: group.vehicleType || '',
            conductorId,
            arrivalTime: group.arrivalTime || '',
          }
        })
        .filter(
          (vehicle) => Boolean(vehicle.id || vehicle.vehicleType || vehicle.conductorId)
        ),
    [cuinaGroups, manualResp]
  )

  useEffect(() => {
    if (!isCuina) return
    const targetWorkers = Number(totalWorkers) || 0
    const targetDrivers = Number(numDrivers) || 0
    setCuinaGroups((prev) => {
      if (!prev.length) {
        return [createCuinaGroup({ workers: targetWorkers, drivers: targetDrivers })]
      }
      const first = prev[0]
      const shouldSync =
        prev.length === 1 &&
        first.workers === cuinaTotalsRef.current.workers &&
        first.drivers === cuinaTotalsRef.current.drivers
      if (!shouldSync) return prev
      return [{ ...first, workers: targetWorkers, drivers: targetDrivers }, ...prev.slice(1)]
    })
    cuinaTotalsRef.current = { workers: targetWorkers, drivers: targetDrivers }
  }, [
    isCuina,
    totalWorkers,
    numDrivers,
    meetingPoint,
    startTime,
    arrivalTime,
    endTime,
  ])

  useEffect(() => {
    if (!isCuina) return
    setCuinaEtt({
      open: false,
      data: {
        serviceDate: extractDate(event.start),
        meetingPoint: 'CENTRAL',
        startTime: event.startTime || '',
        endTime: event.endTime || '',
        workers: '',
      },
    })
  }, [isCuina, open, event.id, event.start, event.startTime, event.endTime, event.location, event.eventLocation])

  useEffect(() => {
    if (!open) return
    setGenerationScope('day')
    setSurveyDeadlineDate(latestAllowedSurveyDeadlineDate || visibleDate)
    setSurveyDeadlineTime(latestAllowedSurveyDeadlineTime || '18:00')
  }, [
    open,
    event.id,
    visibleDate,
    latestAllowedSurveyDeadlineDate,
    latestAllowedSurveyDeadlineTime,
  ])

  useEffect(() => {
    if (!open || !isServeis) return
    setVestimentModelChoice('__none__')
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/quadrants/premises?department=serveis', {
          cache: 'no-store',
        })
        const json = await res.json()
        if (cancelled || !res.ok) return
        const models = Array.isArray(json?.premises?.vestimentModels)
          ? (json.premises.vestimentModels as string[]).map((m) => String(m || '').trim()).filter(Boolean)
          : []
        setServeisVestimentModels(models)
      } catch {
        if (!cancelled) setServeisVestimentModels([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, isServeis])

  useEffect(() => {
    if (!open || !canLaunchSurvey) return
    let cancelled = false

    const run = async () => {
      try {
        setSurveyLoading(true)
        const cachedGroups = surveyPremisesCache.get(department)
        const cachedPeople = surveyPeopleCache.get(department)
        const surveysPromise = fetch(
          `/api/quadrants/surveys?eventId=${encodeURIComponent(event.id)}&department=${encodeURIComponent(
            department
          )}&serviceDate=${encodeURIComponent(visibleDate)}`,
          { cache: 'no-store' }
        ).then((res) => res.json().catch(() => ({})))

        if (cachedGroups) {
          setSurveyGroups(cachedGroups)
        } else {
          setSurveyGroupsLoading(true)
          fetch(`/api/quadrants/premises?department=${encodeURIComponent(department)}`, { cache: 'no-store' })
            .then((res) => res.json().catch(() => ({})))
            .then((premisesJson) => {
              if (cancelled) return
              const groups = Array.isArray(premisesJson?.premises?.surveyGroups)
                ? premisesJson.premises.surveyGroups
                : []
              surveyPremisesCache.set(department, groups)
              setSurveyGroups(groups)
            })
            .finally(() => {
              if (!cancelled) setSurveyGroupsLoading(false)
            })
        }

        if (cachedPeople) {
          setSurveyPeople(cachedPeople)
        }

        const surveysJson = await surveysPromise
        if (cancelled) return
        setSurveys(Array.isArray(surveysJson?.surveys) ? surveysJson.surveys : [])
      } finally {
        if (!cancelled) setSurveyLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [open, canLaunchSurvey, department, event.id, visibleDate])

  const ensureSurveyPeopleLoaded = async () => {
    const cachedPeople = surveyPeopleCache.get(department)
    if (cachedPeople) {
      setSurveyPeople(cachedPeople)
      return
    }

    try {
      setSurveyPeopleLoading(true)
      let request = surveyPeoplePromiseCache.get(department)
      if (!request) {
        request = fetch(`/api/quadrants/premises/personnel?department=${encodeURIComponent(department)}`, {
          cache: 'no-store',
        })
          .then((res) => res.json().catch(() => ({})))
          .then((peopleJson) =>
            Array.isArray(peopleJson?.people)
              ? peopleJson.people.map((person: any) => ({
                  id: String(person?.id || ''),
                  name: String(person?.name || ''),
                }))
              : []
          )
        surveyPeoplePromiseCache.set(department, request)
      }

      const people = await request
      surveyPeopleCache.set(department, people)
      setSurveyPeople(people)
    } finally {
      setSurveyPeopleLoading(false)
    }
  }

  useEffect(() => {
    if (!isCuina) return
    const firstPoint = cuinaGroups[0]?.meetingPoint || ''
    if (firstPoint !== meetingPoint) {
      setMeetingPoint(firstPoint)
    }
  }, [cuinaGroups, isCuina, meetingPoint, setMeetingPoint])

  useEffect(() => {
    if (!isCuina) return
    if (cuinaGroups.length !== 1) return
    if (!manualResp || manualResp === '__auto__') return
    const first = cuinaGroups[0]
    if (!first || !first.wantsResponsible || first.responsibleId) return
    setCuinaGroups((prev) =>
      prev.map((group) =>
        group.id === first.id ? { ...group, responsibleId: manualResp } : group
      )
    )
  }, [isCuina, cuinaGroups, manualResp])

  useEffect(() => {
    if (!isCuina) return
    const firstGroup = cuinaGroups[0]
    if (!firstGroup) return
    if (firstGroup.startTime !== startTime) setStartTime(firstGroup.startTime)
    if (firstGroup.endTime !== endTime) setEndTime(firstGroup.endTime)
    if (firstGroup.arrivalTime !== arrivalTime) setArrivalTime(firstGroup.arrivalTime)
  }, [
    cuinaGroups,
    isCuina,
    startTime,
    endTime,
    arrivalTime,
    setStartTime,
    setEndTime,
    setArrivalTime,
  ])

  const updateCuinaGroup = (id: string, patch: Partial<CuinaGroup>) => {
    setCuinaGroups((prev) => prev.map((group) => (group.id === id ? { ...group, ...patch } : group)))
  }

  const addCuinaGroup = () => {
    setCuinaGroups((prev) => [
      ...prev,
      createCuinaGroup({
        workers: 0,
        drivers: 0,
        needsDriver: false,
        wantsResponsible: false,
      }),
    ])
  }

  const removeCuinaGroup = (id: string) => {
    setCuinaGroups((prev) => {
      const next = prev.filter((group) => group.id !== id)
      return next.length
        ? next
        : [createCuinaGroup({ workers: 0, drivers: 0, needsDriver: false })]
    })
  }

  const canAutoGen = Boolean(startDate && endDate && startTime && endTime)
  const surveySelectedIds = useMemo(
    () => Array.from(new Set([...selectedSurveyWorkerIds, ...surveyGroups
      .filter((group) => selectedSurveyGroupIds.includes(group.id))
      .flatMap((group) => group.workerIds)])),
    [selectedSurveyGroupIds, selectedSurveyWorkerIds, surveyGroups]
  )

  const handleLaunchSurvey = async () => {
    if (!canLaunchSurvey) return
    if (!visibleDate) {
      toast.error('Falta la data del servei')
      return
    }
    if (surveySelectedIds.length === 0) {
      toast.error('Selecciona almenys una persona o grup')
      return
    }

    const deadlineBaseDate = surveyDeadlineDate || visibleDate
    const deadlineAt = new Date(`${deadlineBaseDate}T${surveyDeadlineTime || '18:00'}:00`).getTime()
    if (Number.isNaN(deadlineAt)) {
      toast.error('Data o hora límit no vàlida')
      return
    }
    if (
      latestAllowedSurveyDeadlineAt &&
      deadlineAt > latestAllowedSurveyDeadlineAt.getTime()
    ) {
      toast.error('La data límit ha de ser com a màxim 48h abans de l’esdeveniment')
      return
    }

    try {
      setSurveySubmitting(true)
      const res = await fetch('/api/quadrants/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          department,
          serviceDate: visibleDate,
          deadlineAt,
          targetGroupIds: selectedSurveyGroupIds,
          targetWorkerIds: selectedSurveyWorkerIds,
          snapshot: {
            eventName,
            location,
            service: event.service || null,
            startTime: startTime || event.startTime || '',
            endTime: endTime || event.endTime || '',
            totalWorkers: Number(totalWorkers) || 0,
            totalDrivers: Number(numDrivers) || 0,
          },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'No s ha pogut crear el sondeig')
      }

      setSurveys((prev) => [json.survey, ...prev])
      toast.success('Sondeig enviat a Ops')
    } catch (surveyError) {
      const message = surveyError instanceof Error ? surveyError.message : 'Error enviant el sondeig'
      toast.error(message)
    } finally {
      setSurveySubmitting(false)
    }
  }

  const handleAutoGenAndSave = async () => {
    if (!canAutoGen) return
    setLoading(true)
    setError(null)
    setSuccess(false)

    const manualResponsibleIdValue = manualResp && manualResp !== '__auto__' ? manualResp : null
    const manualResponsibleNameValue = manualResponsibleIdValue
      ? availableResponsables.find((resp) => resp.id === manualResponsibleIdValue)?.name ?? null
      : null

    try {
      const payload: Record<string, unknown> = {
        eventId: event.id,
        code: splitTitle(event.summary || event.title || '').code || '',
        eventName: splitTitle(event.summary || event.title || '').name,
        department,
        location,
        meetingPoint,
        startDate,
        startTime,
        endDate,
        endTime,
        arrivalTime: arrivalTime || null,
        manualResponsibleId: manualResponsibleIdValue,
        manualResponsibleName: manualResponsibleNameValue,
        service: event.service || null,
        numPax: event.numPax ?? null,
        commercial: event.commercial ?? null,
      }

      const timetables: TimetableEntry[] = []
      const addTimetable = (entry: TimetableEntry) => {
        const tt = collectTimetable(entry)
        if (tt) timetables.push(tt)
      }

      if (isCuina) {
        const singleGroup = cuinaGroups.length === 1
        const groupsPayload = cuinaGroups.map((group) => {
          const selectedRespId =
            group.wantsResponsible
              ? (group.responsibleId || manualResponsibleIdValue || '')
              : ''
          const selected = availableResponsables.find((r) => r.id === selectedRespId)
          const selectedDriverId =
            group.driverMode === '__responsable__'
              ? selectedRespId || manualResponsibleIdValue || ''
              : group.driverMode !== '__auto__'
              ? group.driverMode
              : ''
          const selectedDriver =
            selectedDriverId && selectedDriverId !== '__auto__'
              ? availableConductors.find((conductor) => conductor.id === selectedDriverId) || null
              : null
          const responsibleActsAsDriver =
            group.driverMode === '__responsable__' &&
            Number(group.drivers || 0) > 0 &&
            isManualResponsibleConductor
          return {
            meetingPoint: group.meetingPoint || meetingPoint || '',
            startTime: group.startTime,
            arrivalTime: group.arrivalTime || null,
            endTime: group.endTime,
            workers: group.workers,
            drivers: Math.max(0, Number(group.drivers || 0)),
            needsDriver: Number(group.drivers || 0) > 0,
            wantsResponsible: group.wantsResponsible,
            responsibleId:
              selectedRespId && selectedRespId !== '__auto__' ? selectedRespId : null,
            responsibleName: group.wantsResponsible ? selected?.name || null : null,
            driverName:
              selectedDriver?.name ||
              (singleGroup && responsibleActsAsDriver ? manualResponsibleNameValue || null : null),
            driverId:
              selectedDriverId && selectedDriverId !== '__auto__' ? selectedDriverId : null,
          }
        })

        payload.groups = groupsPayload
        payload.totalWorkers = cuinaTotals.workers
        payload.numDrivers = cuinaTotals.drivers
        payload.cuinaGroupCount = cuinaGroups.length
        payload.vehicles = cuinaVehiclesPayload
        groupsPayload.forEach((group) => addTimetable(group))
      } else if (isServeis) {
        const groupsPayload = buildServiceGroupsPayload(
          manualResponsibleIdValue,
          manualResponsibleNameValue
        ).map((group) => ({
          ...group,
          driverName: group.driverId
            ? availableConductors.find((conductor) => conductor.id === group.driverId)?.name || null
            : null,
        }))
        payload.groups = groupsPayload
        payload.totalWorkers = serviceTotals.workers
        payload.numDrivers = serviceTotals.drivers
        payload.jamoneroCount = serviceJamoneroAssignments.length
        payload.serviceJamoneroAssignments = serviceJamoneroAssignments.map((assignment) => ({
          id: assignment.id,
          mode: assignment.mode,
          personnelId:
            assignment.mode === 'manual' && assignment.personnelId
              ? assignment.personnelId
              : null,
          personnelName:
            assignment.mode === 'manual' && assignment.personnelId
              ? availableJamoneros.find((person) => person.id === assignment.personnelId)?.name || null
              : null,
        }))
        groupsPayload.forEach((group) => addTimetable(group))
        payload.vestimentModel =
          vestimentModelChoice !== '__none__' ? vestimentModelChoice.trim() : null
      } else {
        const logisticaPhases = buildLogisticaPhases()
        logisticaPhases.forEach((phase) => phase.timetables?.forEach((tt) => addTimetable(tt)))

        const baseLogisticaPayload: Record<string, unknown> = {
          ...payload,
          totalWorkers: Number(totalWorkers) || 0,
          numDrivers: Number(numDrivers) || 0,
          logisticaPhases,
        }

        if (ettEntry) {
          const externalWorkers = [
            ...(Array.isArray(baseLogisticaPayload.externalWorkers)
              ? (baseLogisticaPayload.externalWorkers as any[])
              : []),
            ...Array.from({ length: Number(ettEntry.workers || 0) }, () => ({
              name: 'ETT',
              isExternal: true,
              meetingPoint: ettEntry.meetingPoint,
              startDate: ettEntry.startDate,
              endDate: ettEntry.endDate,
              startTime: ettEntry.startTime,
              endTime: ettEntry.endTime,
            })),
          ]
          baseLogisticaPayload.externalWorkers = externalWorkers
          addTimetable(ettEntry)
        }

        const payloads =
          isMultiDayEvent && generationScope === 'event'
            ? multiDayDates.map((date) => clonePayloadForDate(baseLogisticaPayload, department, date))
            : [baseLogisticaPayload]

        let preferredAssignments: ReturnType<typeof buildPreferredAssignments> = null
        for (const payloadToSend of payloads) {
          const response = await submitQuadrantPayload({
            ...payloadToSend,
            ...(preferredAssignments || {}),
          })
          toastAutoAssignDoubleBookingWarnings(response)
          preferredAssignments = buildPreferredAssignments(response?.proposal)
        }

        setSuccess(true)
        toast.success(
          isMultiDayEvent && generationScope === 'event'
            ? 'Borradors creats per tots els dies de l’esdeveniment!'
            : 'Borrador creat correctament!'
        )
        window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
        onOpenChange(false)
        return
      }

      if (timetables.length) {
        payload.timetables = timetables
      }

      const ettEntries: Array<{
        name: string
        isExternal: boolean
        meetingPoint: string
        startDate: string
        endDate: string
        startTime: string
        endTime: string
      }> = []

      if (isServeis) {
        Object.values(servicePhaseEtt).forEach((ettState) => {
          const workers = Number(ettState.data.workers || 0)
          if (!workers) return
          ettEntries.push(
            ...Array.from({ length: workers }, () => ({
              name: 'ETT',
              isExternal: true,
              meetingPoint: ettState.data.meetingPoint || meetingPoint,
              startDate: ettState.data.serviceDate || startDate,
              endDate: ettState.data.serviceDate || endDate,
              startTime: ettState.data.startTime || startTime,
              endTime: ettState.data.endTime || endTime,
            }))
          )
        })
      } else if (isCuina) {
        const workers = Number(cuinaEtt.data.workers || 0)
        if (workers) {
          ettEntries.push(
            ...Array.from({ length: workers }, () => ({
              name: 'ETT',
              isExternal: true,
              meetingPoint: cuinaEtt.data.meetingPoint || meetingPoint,
              startDate: cuinaEtt.data.serviceDate || startDate,
              endDate: cuinaEtt.data.serviceDate || endDate,
              startTime: cuinaEtt.data.startTime || startTime,
              endTime: cuinaEtt.data.endTime || endTime,
            }))
          )
        }
      }

      if (ettEntries.length) {
        const existingExternalWorkers = Array.isArray(payload.externalWorkers)
          ? (payload.externalWorkers as any[])
          : []
        payload.externalWorkers = [...existingExternalWorkers, ...ettEntries]
        ettEntries.forEach((entry) => addTimetable({ startTime: entry.startTime, endTime: entry.endTime }))
      }

      const payloads =
        isMultiDayEvent && generationScope === 'event'
          ? multiDayDates.map((date) => clonePayloadForDate(payload, department, date))
          : [payload]

      let preferredAssignments: ReturnType<typeof buildPreferredAssignments> = null
      for (const payloadToSend of payloads) {
        const response = await submitQuadrantPayload({
          ...payloadToSend,
          ...(preferredAssignments || {}),
        })
        toastAutoAssignDoubleBookingWarnings(response)
        preferredAssignments = buildPreferredAssignments(response?.proposal)
      }

      setSuccess(true)
      toast.success(
        isMultiDayEvent && generationScope === 'event'
          ? 'Borradors creats per tots els dies de l’esdeveniment!'
          : 'Borrador creat correctament!'
      )
      window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as Error
      setError(error.message)
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[97vw] !max-w-[1700px] max-h-[92vh] overflow-y-auto rounded-2xl p-3 sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader className="gap-1">
          <DialogTitle className="text-lg font-bold">{eventName}</DialogTitle>
          <DialogDescription>
            Servei {event.service || '—'} · PAX {event.numPax ?? '—'} · Hora inici {event.startTime || startTime || '—:—'}
            {location ? ` · Ubicació ${location}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {!isLogistica && !isCuina && (
            <div className={`grid gap-4 ${isServeis ? 'lg:grid-cols-3' : 'grid-cols-2'}`}>
              {!isServeis && (
                <>
                  <div>
                    <Label>Data Inici</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Data Final</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </>
              )}
              {!isCuina && !isServeis && (
                <div>
                  <Label>Hora Inici</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
              )}
              {!isCuina && !isServeis && (
                <div>
                  <Label>Hora Fi</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {!isLogistica && !isServeis && isCuina && (
            <div className="grid gap-4 xl:grid-cols-[180px_180px_minmax(320px,1fr)_auto] items-end">
              <div>
                <Label>Hora Inici</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Hora Fi</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <div>
                <Label>Responsable principal (esdeveniment)</Label>
                <Select value={manualResp} onValueChange={setManualResp}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un responsable…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">— Automàtic —</SelectItem>
                    {availableResponsables.map((resp) => (
                      <SelectItem key={resp.id} value={resp.id}>
                        {resp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <GenerationScopeToggle
                isMultiDayEvent={isMultiDayEvent}
                generationScope={generationScope}
                setGenerationScope={setGenerationScope}
              />
            </div>
          )}

          {isServeis && (
            <div className="space-y-2">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(0,1.25fr)_minmax(0,1fr)_auto] xl:items-end">
                <div className="min-w-0">
                  <Label>Hora Inici</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>Hora Fi</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <Label>Responsable (manual)</Label>
                  <Select value={manualResp} onValueChange={setManualResp}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un responsable…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">— Automàtic —</SelectItem>
                      {availableResponsables.map((resp) => (
                        <SelectItem key={resp.id} value={resp.id}>
                          {resp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <Label>Model de vestimenta</Label>
                  <Select value={vestimentModelChoice} onValueChange={setVestimentModelChoice}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Cap —</SelectItem>
                      {serveisVestimentModels.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end sm:col-span-2 xl:col-span-1 xl:justify-end">
                  <GenerationScopeToggle
                    isMultiDayEvent={isMultiDayEvent}
                    generationScope={generationScope}
                    setGenerationScope={setGenerationScope}
                  />
                </div>
              </div>
              {serveisVestimentModels.length === 0 && (
                <p className="text-xs text-amber-700">
                  No hi ha models definits. Defineix-los a Premisses (Serveis).
                </p>
              )}
            </div>
          )}

          {isLogistica && (
            <div className="grid gap-4 xl:grid-cols-[180px_180px_auto] items-end">
              <div>
                <Label>Hora Inici</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>Hora Fi</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
              <GenerationScopeToggle
                isMultiDayEvent={isMultiDayEvent}
                generationScope={generationScope}
                setGenerationScope={setGenerationScope}
              />
            </div>
          )}

          <SurveyLaunchPanel
            canLaunchSurvey={canLaunchSurvey}
            visibleDate={visibleDate}
            latestAllowedDeadlineDate={latestAllowedSurveyDeadlineDate}
            latestAllowedDeadlineTime={latestAllowedSurveyDeadlineTime}
            surveys={surveys}
            surveyGroupsLoading={surveyGroupsLoading}
            surveyPeopleLoading={surveyPeopleLoading}
            surveyGroups={surveyGroups}
            surveyPeople={surveyPeople}
            selectedSurveyGroupIds={selectedSurveyGroupIds}
            setSelectedSurveyGroupIds={setSelectedSurveyGroupIds}
            selectedSurveyWorkerIds={selectedSurveyWorkerIds}
            setSelectedSurveyWorkerIds={setSelectedSurveyWorkerIds}
            surveyDeadlineDate={surveyDeadlineDate}
            setSurveyDeadlineDate={setSurveyDeadlineDate}
            surveyDeadlineTime={surveyDeadlineTime}
            setSurveyDeadlineTime={setSurveyDeadlineTime}
            handleLaunchSurvey={handleLaunchSurvey}
            ensureSurveyPeopleLoaded={ensureSurveyPeopleLoaded}
            surveySubmitting={surveySubmitting}
          />

          {isServeis && (
            <ServicePhasePanel
              groups={servicePhaseGroups}
              totals={serviceTotals}
              meetingPoint={meetingPoint}
              eventStartDate={startDate}
              settings={servicePhaseSettings}
              visibility={servicePhaseVisibility}
              ettState={servicePhaseEtt}
              manualResponsibleId={manualResp}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              availableJamoneros={availableJamoneros}
              jamoneroAssignments={serviceJamoneroAssignments}
              setJamoneroCount={setServiceJamoneroCount}
              updateJamoneroAssignment={updateServiceJamoneroAssignment}
              setManualResponsible={setManualResp}
              toggleSelection={toggleServicePhaseSelection}
              updateSetting={updateServicePhaseSetting}
              toggleVisibility={toggleServicePhaseVisibility}
              addGroup={addServiceGroup}
              removeGroup={removeServiceGroup}
              updateGroup={updateServiceGroup}
              toggleEtt={toggleServicePhaseEtt}
              updateEtt={updateServicePhaseEtt}
            />
          )}

          {isLogistica && (
            <LogisticsPhasePanel
              phaseForms={phaseForms}
              phaseSettings={phaseSettings}
              phaseVisibility={phaseVisibility}
              phaseResponsibles={phaseResponsibles}
              phaseVehicleAssignments={phaseVehicleAssignments}
              availableVehicles={availableVehicles}
              availableConductors={availableConductors}
              availableResponsables={availableResponsables}
              togglePhaseVisibility={togglePhaseVisibility}
              updatePhaseForm={updatePhaseForm}
              updatePhaseSetting={updatePhaseSetting}
              updatePhaseResponsible={updatePhaseResponsible}
              updatePhaseVehicleAssignment={updatePhaseVehicleAssignment}
              ettOpen={ettOpen}
              ettData={ettData}
              toggleEtt={() => setEttOpen(!ettOpen)}
              updateEtt={(patch) => setEttData({ ...ettData, ...patch })}
            />
          )}

          {isCuina && (
            <CuinaSection
              cuinaTotals={cuinaTotals}
              cuinaGroups={cuinaGroups}
              removeCuinaGroup={removeCuinaGroup}
              updateCuinaGroup={updateCuinaGroup}
              manualResp={manualResp}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              addCuinaGroup={addCuinaGroup}
              cuinaEtt={cuinaEtt}
              setCuinaEtt={setCuinaEtt}
            />
          )}

          <AnimatePresence>
            {error && (
              <motion.div className="text-red-600 flex items-center gap-2 text-sm">
                <AlertTriangle size={18} /> {error}
              </motion.div>
            )}
            {success && (
              <motion.div className="text-green-600 flex items-center gap-2">
                <CheckCircle2 size={20} /> Borrador creat!
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="mt-3 flex justify-end gap-2">
          <Button
            className="bg-blue-600 text-white gap-2"
            onClick={handleAutoGenAndSave}
            disabled={!canAutoGen || loading}
          >
            {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {loading ? 'Processant…' : 'Auto generar i desa'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel·la
          </Button>
        </DialogFooter>

        <DialogClose className="absolute top-3 right-3 text-gray-500 hover:text-gray-800">×</DialogClose>
      </DialogContent>
    </Dialog>
  )
}

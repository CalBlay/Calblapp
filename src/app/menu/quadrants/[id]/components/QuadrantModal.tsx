'use client'

import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import { useQuadrantFormState } from '../hooks/useQuadrantFormState'
import LogisticsPhasePanel from './LogisticsPhasePanel'
import ServicePhasePanel from './ServicePhasePanel'
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
  /** Després de desar correctament: refrescar llista de quadrants abans de tancar (punt blau / comptadors). */
  onSaved?: () => Promise<void>
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
  /** Mode manual: igual que Serveis — IDs de slots de treballadors */
  workerIds?: string[]
  workerDetails?: Record<
    string,
    {
      id: string
      name?: string
      serviceDate?: string
      meetingPoint?: string
      startTime?: string
      endTime?: string
    }
  >
}

type TimetableEntry = {
  startTime?: string
  endTime?: string
}

type GenerationScope = 'day' | 'event'
type QuadrantMode = 'auto' | 'semi' | 'manual'

type SessionUserInfo = {
  role?: string
  department?: string
  dept?: string
}

type GroupPayload = Record<string, unknown> & {
  serviceDate?: string
}

type ExternalWorkerPayload = {
  name?: string
  isExternal?: boolean
  meetingPoint?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
}

type SurveyPersonApi = {
  id?: unknown
  name?: unknown
}

type SubmitQuadrantResponse = {
  ok?: boolean
  success?: boolean
  error?: string
  docIds?: string[]
  /** True quan el POST ha confirmat al mateix desament (manual Serveis/Cuina/Logística + confirmImmediately). */
  confirmInlineApplied?: boolean
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
    nextPayload.groups = payload.groups.map((group) => {
      const merged = {
        ...(group as GroupPayload),
        ...group,
        serviceDate:
          department === 'serveis' ? date : (group as GroupPayload)?.serviceDate ?? date,
      } as Record<string, unknown>
      if (Array.isArray(merged.manualWorkers)) {
        merged.manualWorkers = (merged.manualWorkers as Array<Record<string, unknown>>).map((mw) => ({
          ...mw,
          serviceDate: date,
        }))
      }
      return merged
    })
  }

  if (Array.isArray(payload.externalWorkers)) {
    nextPayload.externalWorkers = payload.externalWorkers.map((worker) => ({
      ...worker,
      startDate: date,
      endDate: date,
    }))
  }

  if (Array.isArray(payload.logisticaPhases)) {
    nextPayload.logisticaPhases = payload.logisticaPhases.map((phase: Record<string, unknown>) => ({
      ...phase,
      date,
      endDate: date,
      manualWorkers: Array.isArray(phase.manualWorkers)
        ? phase.manualWorkers.map((mw: Record<string, unknown>) => ({ ...mw, serviceDate: date }))
        : phase.manualWorkers,
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
  let data: SubmitQuadrantResponse
  try {
    data = text ? (JSON.parse(text) as SubmitQuadrantResponse) : {}
  } catch {
    throw new Error('Resposta invàlida del servidor')
  }

  if (!res.ok || data.ok === false || data.success === false) {
    throw new Error(data.error || 'Error desant el quadrant')
  }

  return data
}

const confirmSavedQuadrants = async (params: {
  department: string
  eventId: string
  docIds: string[]
}) => {
  const res = await fetch('/api/quadrants/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      department: params.department,
      eventId: params.eventId,
      docIds: params.docIds,
    }),
  })
  const text = await res.text()
  let data: { ok?: boolean; error?: string }
  try {
    data = text ? (JSON.parse(text) as { ok?: boolean; error?: string }) : {}
  } catch {
    return { ok: false as const, error: 'Resposta invàlida del servidor' }
  }
  if (!res.ok || data.ok === false) {
    return { ok: false as const, error: data.error || `Error ${res.status}` }
  }
  return { ok: true as const }
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

export default function QuadrantModal({ open, onOpenChange, event, onSaved }: QuadrantModalProps) {
  const { data: session } = useSession()
  const sessionUser = session?.user as SessionUserInfo | undefined
  const userRole = normalizeRole(String(sessionUser?.role || ''))
  const department = (
    sessionUser?.department ||
    sessionUser?.dept ||
    'serveis'
  )
    .toString()
    .toLowerCase()
  const isCuina = department === 'cuina'
  const isServeis = department === 'serveis'
  const isLogistica = department === 'logistica'
  /** Serveis, Cuina, Logística: mateix comportament de modes, training i guardar+confirmar. */
  const isQuadrantCoreDept = isServeis || isCuina || isLogistica
  const [mode, setMode] = useState<QuadrantMode>('semi')

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
    setLocation: _setLocation,
    meetingPoint,
    setMeetingPoint,
    manualResp,
    setManualResp,
    totalWorkers,
    setTotalWorkers: _setTotalWorkers,
    numDrivers,
    setNumDrivers: _setNumDrivers,
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
    vehiclesPayload: _vehiclesPayload,
    buildLogisticaPhases,
    ettEntry,
    availableResponsables,
    availableConductors,
    availableJamoneros,
    availableTreballadors,
  } = useQuadrantFormState({ event, department, modalOpen: open, mode })

  const rawTitle = event.summary || event.title || ''
  const { name: eventName, code: parsedCode } = splitTitle(rawTitle)
  const _eventCode = parsedCode || (rawTitle.match(/[A-Z]\d{6,}/)?.[0] ?? '').toUpperCase()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [generationScope, setGenerationScope] = useState<GenerationScope>('day')
  const [showJamoneroDetails, setShowJamoneroDetails] = useState(true)
  const [surveyGroupsLoading, setSurveyGroupsLoading] = useState(false)
  const [surveyPeopleLoading, setSurveyPeopleLoading] = useState(false)
  const [_surveyLoading, setSurveyLoading] = useState(false)
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
  const _eventRangeStart = extractDate(event.originalStart || event.start)
  const _eventRangeEnd = extractDate(event.originalEnd || event.end || event.start)
  const multiDayDates = useMemo(
    () => getDateRange(event.originalStart || event.start, event.originalEnd || event.end || event.start),
    [event.end, event.originalEnd, event.originalStart, event.start]
  )
  const isMultiDayEvent = multiDayDates.length > 1
  const canLaunchSurvey = userRole === 'admin' || userRole === 'direccio' || userRole === 'cap'
  const createCuinaGroup = useCallback((seed: Partial<CuinaGroup> = {}): CuinaGroup => {
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
      workerIds: Array.isArray(seed.workerIds) ? [...seed.workerIds] : [],
      workerDetails: seed.workerDetails ? { ...seed.workerDetails } : {},
    }
  }, [arrivalTime, meetingPoint, numDrivers, startTime, endTime, totalWorkers])

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
    createCuinaGroup,
    isCuina,
    totalWorkers,
    numDrivers,
    meetingPoint,
    startTime,
    arrivalTime,
    endTime,
  ])

  /** Cuina manual: sincronitza slots de treballadors amb el nombre (mateix patró que Serveis). */
  useEffect(() => {
    if (!isCuina || mode !== 'manual') return
    setCuinaGroups((prev) => {
      let changed = false
      const next = prev.map((g) => {
        const w = Math.max(0, Number(g.workers) || 0)
        let ids = Array.isArray(g.workerIds) ? [...g.workerIds] : []
        const details = { ...(g.workerDetails || {}) }
        if (ids.length === w) return g
        changed = true
        if (ids.length > w) {
          ids.slice(w).filter(Boolean).forEach((id) => delete details[id])
          ids = ids.slice(0, w)
        } else {
          ids = [...ids, ...Array.from({ length: w - ids.length }, () => '')]
        }
        return { ...g, workerIds: ids, workerDetails: details }
      })
      return changed ? next : prev
    })
  }, [isCuina, mode])

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
    if (mode !== 'manual') return
    if (manualResp === '__auto__') {
      setManualResp('')
    }
  }, [manualResp, mode, setManualResp])

  useEffect(() => {
    if (!open || !isServeis) return
    const draftVestimentRaw = String((event as unknown as { draft?: { vestimentModel?: string | null } })?.draft?.vestimentModel || '').trim()
    setVestimentModelChoice(draftVestimentRaw || '__none__')
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
  }, [event, open, isServeis])

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
              ? peopleJson.people.map((person: SurveyPersonApi) => ({
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

  const handleAutoGenAndSave = async (confirmAfterSave = false) => {
    if (!canAutoGen) return
    setLoading(true)
    setError(null)
    setSuccess(false)
    let shouldClose = false

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
        mode,
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
              : group.driverMode && group.driverMode !== '__auto__'
              ? group.driverMode
              : ''
          const selectedDriver =
            selectedDriverId && selectedDriverId !== '__auto__'
              ? availableConductors.find((conductor) => conductor.id === selectedDriverId) || null
              : null
          const resolvedWorkerIds = Array.isArray(group.workerIds) ? group.workerIds.filter(Boolean) : []
          const resolvedWorkerDetails = group.workerDetails || {}
          const manualWorkers =
            mode === 'manual' && resolvedWorkerIds.length > 0
              ? resolvedWorkerIds.map((id) => {
                  const d = resolvedWorkerDetails[id] || { id }
                  return {
                    id,
                    name: d.name,
                    serviceDate: d.serviceDate || startDate,
                    meetingPoint: d.meetingPoint || group.meetingPoint || meetingPoint,
                    startTime: d.startTime || group.startTime,
                    endTime: d.endTime || group.endTime,
                  }
                })
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
            ...(manualWorkers ? { manualWorkers } : {}),
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
              ? (baseLogisticaPayload.externalWorkers as ExternalWorkerPayload[])
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

        if (confirmAfterSave && mode === 'manual' && isQuadrantCoreDept) {
          baseLogisticaPayload.confirmImmediately = true
        }

        const payloads =
          isMultiDayEvent && generationScope === 'event'
            ? multiDayDates.map((date) => clonePayloadForDate(baseLogisticaPayload, department, date))
            : [baseLogisticaPayload]

        const expectConfirmInlineEachLog =
          Boolean(confirmAfterSave && mode === 'manual' && isQuadrantCoreDept)

        let preferredAssignments: ReturnType<typeof buildPreferredAssignments> = null
        const createdDocIds: string[] = []
        let allResponsesConfirmInlineOkLog = expectConfirmInlineEachLog
        for (const payloadToSend of payloads) {
          const response = await submitQuadrantPayload({
            ...payloadToSend,
            ...(preferredAssignments || {}),
          })
          toastAutoAssignDoubleBookingWarnings(response)
          preferredAssignments = buildPreferredAssignments(response?.proposal)
          if (Array.isArray(response?.docIds)) createdDocIds.push(...response.docIds)
          if (expectConfirmInlineEachLog && !response.confirmInlineApplied) {
            allResponsesConfirmInlineOkLog = false
          }
        }

        if (confirmAfterSave && createdDocIds.length > 0) {
          if (expectConfirmInlineEachLog && allResponsesConfirmInlineOkLog) {
            toast.success(
              isMultiDayEvent && generationScope === 'event'
                ? 'Quadrants confirmats per tots els dies!'
                : 'Quadrant confirmat correctament!'
            )
            window.dispatchEvent(new CustomEvent('quadrant:updated'))
            window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } }))
          } else {
            const confirmResult = await confirmSavedQuadrants({
              department,
              eventId: event.id,
              docIds: Array.from(new Set(createdDocIds)),
            })
            if (confirmResult.ok) {
              toast.success(
                isMultiDayEvent && generationScope === 'event'
                  ? 'Quadrants confirmats per tots els dies!'
                  : 'Quadrant confirmat correctament!'
              )
              window.dispatchEvent(new CustomEvent('quadrant:updated'))
              window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } }))
            } else {
              toast.warning(
                `S’ha desat el borrador; no s’ha pogut confirmar: ${confirmResult.error || 'error desconegut'}`
              )
              window.dispatchEvent(new CustomEvent('quadrant:updated'))
              window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
            }
          }
        } else {
          toast.success(
            isMultiDayEvent && generationScope === 'event'
              ? 'Borradors creats per tots els dies de l’esdeveniment!'
              : 'Borrador creat correctament!'
          )
          window.dispatchEvent(new CustomEvent('quadrant:updated'))
          window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
        }

        try {
          void onSaved?.().catch(() => {
            /* la llista s’actualitza en segon pla */
          })
        } catch {
          /* ignorar */
        }
        shouldClose = true
        setSuccess(true)
        setLoading(false)
        onOpenChange(false)
        return
      }

      if (timetables.length) {
        payload.timetables = timetables
      }

      // Mode manual: la selecció de noms es fa al lloc natural (grups/fases)

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
          ? (payload.externalWorkers as ExternalWorkerPayload[])
          : []
        payload.externalWorkers = [...existingExternalWorkers, ...ettEntries]
        ettEntries.forEach((entry) => addTimetable({ startTime: entry.startTime, endTime: entry.endTime }))
      }

      if (confirmAfterSave && mode === 'manual' && isQuadrantCoreDept) {
        payload.confirmImmediately = true
      }

      const payloads =
        isMultiDayEvent && generationScope === 'event'
          ? multiDayDates.map((date) => clonePayloadForDate(payload, department, date))
          : [payload]

      const expectConfirmInlineEach =
        Boolean(confirmAfterSave && mode === 'manual' && isQuadrantCoreDept)

      let preferredAssignments: ReturnType<typeof buildPreferredAssignments> = null
      const createdDocIds: string[] = []
      let allResponsesConfirmInlineOk = expectConfirmInlineEach
      for (const payloadToSend of payloads) {
        const response = await submitQuadrantPayload({
          ...payloadToSend,
          ...(preferredAssignments || {}),
        })
        toastAutoAssignDoubleBookingWarnings(response)
        preferredAssignments = buildPreferredAssignments(response?.proposal)
        if (Array.isArray(response?.docIds)) createdDocIds.push(...response.docIds)
        if (expectConfirmInlineEach && !response.confirmInlineApplied) {
          allResponsesConfirmInlineOk = false
        }
      }

      if (confirmAfterSave && createdDocIds.length > 0) {
        if (expectConfirmInlineEach && allResponsesConfirmInlineOk) {
          toast.success(
            isMultiDayEvent && generationScope === 'event'
              ? 'Quadrants confirmats per tots els dies!'
              : 'Quadrant confirmat correctament!'
          )
          window.dispatchEvent(new CustomEvent('quadrant:updated'))
          window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } }))
        } else {
          const confirmResult = await confirmSavedQuadrants({
            department,
            eventId: event.id,
            docIds: Array.from(new Set(createdDocIds)),
          })
          if (confirmResult.ok) {
            toast.success(
              isMultiDayEvent && generationScope === 'event'
                ? 'Quadrants confirmats per tots els dies!'
                : 'Quadrant confirmat correctament!'
            )
            window.dispatchEvent(new CustomEvent('quadrant:updated'))
            window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'confirmed' } }))
          } else {
            toast.warning(
              `S’ha desat el borrador; no s’ha pogut confirmar: ${confirmResult.error || 'error desconegut'}`
            )
            window.dispatchEvent(new CustomEvent('quadrant:updated'))
            window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
          }
        }
      } else {
        toast.success(
          isMultiDayEvent && generationScope === 'event'
            ? 'Borradors creats per tots els dies de l’esdeveniment!'
            : 'Borrador creat correctament!'
        )
        window.dispatchEvent(new CustomEvent('quadrant:updated'))
        window.dispatchEvent(new CustomEvent('quadrant:created', { detail: { status: 'draft' } }))
      }

      try {
        void onSaved?.().catch(() => {
          /* la llista s’actualitza en segon pla */
        })
      } catch {
        /* ignorar */
      }
      shouldClose = true
      setSuccess(true)
      setLoading(false)
      onOpenChange(false)
    } catch (err: unknown) {
      const error = err as Error
      setError(error.message)
      toast.error(error.message)
    } finally {
      if (!shouldClose) setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[97vw] !max-w-[1700px] max-h-[92vh] overflow-hidden rounded-2xl p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[92vh] flex-col">
          <div className="relative border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-3 py-3 sm:px-4">
            <DialogHeader className="gap-1 pr-10">
              <DialogTitle className="text-lg font-bold text-slate-900">{eventName}</DialogTitle>
              <DialogDescription className="text-slate-600">
                Servei {event.service || '—'} · PAX {event.numPax ?? '—'} · Hora inici{' '}
                {event.startTime || startTime || '—:—'}
                {location ? ` · Ubicació ${location}` : ''}
              </DialogDescription>
            </DialogHeader>

            <DialogClose className="absolute right-3 top-3 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-sm text-slate-600 shadow-sm backdrop-blur hover:bg-white hover:text-slate-900">
              ✕
            </DialogClose>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-end">
                  <div>
                    <Label>Mode</Label>
                    <div className="grid grid-cols-3 gap-2 max-w-[520px]">
                      <Button
                        type="button"
                        variant={mode === 'auto' ? 'default' : 'secondary'}
                        className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
                        onClick={() => setMode('auto')}
                      >
                        Auto
                      </Button>
                      <Button
                        type="button"
                        variant={mode === 'semi' ? 'default' : 'secondary'}
                        className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
                        onClick={() => setMode('semi')}
                      >
                        Semi-auto
                      </Button>
                      <Button
                        type="button"
                        variant={mode === 'manual' ? 'default' : 'secondary'}
                        className="h-9 rounded-full px-4 w-full justify-center whitespace-nowrap"
                        onClick={() => setMode('manual')}
                      >
                        Manual
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,140px)_minmax(0,140px)_minmax(0,260px)_1fr_auto] xl:items-end">
                <div className="min-w-0">
                  <Label>Hora Inici</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>Hora Fi</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                  <Label>Responsable principal (esdeveniment)</Label>
                  <Select value={manualResp} onValueChange={setManualResp}>
                    <SelectTrigger className="h-10 w-full max-w-full xl:max-w-[260px]">
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
                  <div className="text-left leading-tight sm:text-right xl:mr-1">
                    <div className="text-xs font-semibold text-slate-700">Fase cuina</div>
                    <div className="text-[11px] text-slate-500">
                      Treballadors {cuinaTotals.workers} · Conductors {cuinaTotals.drivers} · Grups{' '}
                      {cuinaTotals.responsables}
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-end sm:col-span-2 xl:col-span-1">
                  <GenerationScopeToggle
                    isMultiDayEvent={isMultiDayEvent}
                    generationScope={generationScope}
                    setGenerationScope={setGenerationScope}
                  />
                </div>
              </div>
            </div>
          )}

          {isServeis && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,148px)_minmax(0,120px)_minmax(0,120px)_minmax(0,170px)_minmax(0,1fr)_auto] md:items-end md:justify-items-stretch md:gap-x-3 md:gap-y-0">
                <div className="min-w-0">
                  <Label>Responsable</Label>
                  <Select value={manualResp} onValueChange={setManualResp}>
                    <SelectTrigger className="h-10 w-full max-w-full">
                      <SelectValue
                        placeholder={mode === 'manual' ? 'Selecciona un responsable…' : 'Automàtic'}
                        className="min-w-0 truncate text-left [&>span]:truncate"
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {mode !== 'manual' && <SelectItem value="__auto__">Automàtic</SelectItem>}
                      {availableResponsables.map((resp) => (
                        <SelectItem key={resp.id} value={resp.id}>
                          {resp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label>Hora Inici</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>Hora Fi</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
                <div className="min-w-0">
                  <Label>Jamoneros</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      className="w-[88px] text-center tabular-nums"
                      value={serviceJamoneroAssignments.length}
                      onChange={(e) =>
                        setServiceJamoneroCount(
                          Number.isNaN(Number(e.target.value)) ? 0 : Math.max(0, Number(e.target.value))
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 px-3"
                      disabled={serviceJamoneroAssignments.length === 0 || (mode !== 'semi' && mode !== 'manual')}
                      onClick={() => setShowJamoneroDetails((prev) => !prev)}
                    >
                      {showJamoneroDetails ? 'Amaga' : 'Detall'}
                    </Button>
                  </div>
                </div>
                <div className="min-w-0">
                  <Label htmlFor="vestiment-model-serveis">Model de vestimenta</Label>
                  <div className="mt-1 flex flex-col gap-1.5 md:mt-0 md:flex-row md:items-end md:gap-2">
                    <Select value={vestimentModelChoice} onValueChange={setVestimentModelChoice}>
                      <SelectTrigger id="vestiment-model-serveis" className="h-10 w-full shrink-0 md:w-[168px]">
                        <SelectValue
                          placeholder="Selecciona…"
                          className="min-w-0 flex-1 truncate text-left [&>span]:truncate"
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Cap —</SelectItem>
                        {vestimentModelChoice !== '__none__' &&
                        !serveisVestimentModels.includes(vestimentModelChoice) ? (
                          <SelectItem value={vestimentModelChoice}>{vestimentModelChoice}</SelectItem>
                        ) : null}
                        {serveisVestimentModels.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-600 md:pb-px">
                      <span className="font-semibold text-slate-700">Fase serveis</span>{' '}
                      <span className="text-slate-500">
                        · Treballadors {serviceTotals.workers} · Conductors {serviceTotals.drivers} · Fases{' '}
                        {serviceTotals.responsables}
                        {serviceTotals.jamoneros > 0 ? ` · Jamoneros ${serviceTotals.jamoneros}` : ''}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 shrink-0 items-end justify-end md:justify-self-end">
                  <GenerationScopeToggle
                    isMultiDayEvent={isMultiDayEvent}
                    generationScope={generationScope}
                    setGenerationScope={setGenerationScope}
                  />
                </div>
              </div>
              {showJamoneroDetails && (mode === 'semi' || mode === 'manual') && serviceJamoneroAssignments.length > 0 && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {serviceJamoneroAssignments.map((assignment, index) => (
                      <div key={assignment.id}>
                        <Label>Jamonero {index + 1}</Label>
                        <Select
                          value={
                            assignment.mode === 'manual' && assignment.personnelId
                              ? assignment.personnelId
                              : '__auto__'
                          }
                          onValueChange={(value) =>
                            updateServiceJamoneroAssignment(assignment.id, {
                              mode: value === '__auto__' ? 'auto' : 'manual',
                              personnelId: value === '__auto__' ? '' : value,
                            })
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Automàtic" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__auto__">Automàtic</SelectItem>
                            {availableJamoneros.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

          {isServeis && (
            <ServicePhasePanel
              groups={servicePhaseGroups}
              totals={serviceTotals}
              meetingPoint={meetingPoint}
              eventStartDate={startDate}
              mode={mode}
              settings={servicePhaseSettings}
              visibility={servicePhaseVisibility}
              ettState={servicePhaseEtt}
              manualResponsibleId={manualResp}
              availableResponsables={availableResponsables}
              availableConductors={availableConductors}
              availableJamoneros={availableJamoneros}
              availableTreballadors={availableTreballadors}
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
              mode={mode}
              availableTreballadors={availableTreballadors}
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
              mode={mode}
              cuinaGroups={cuinaGroups}
              removeCuinaGroup={removeCuinaGroup}
              updateCuinaGroup={updateCuinaGroup}
              manualResp={manualResp}
              serviceDate={startDate}
              availableTreballadors={availableTreballadors}
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
          </div>

          <div className="sticky bottom-0 border-t border-slate-200 bg-white/80 px-3 py-3 backdrop-blur sm:px-4">
            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="sm:min-w-[140px]">
                Cancel·la
              </Button>
              {mode === 'manual' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50 sm:min-w-[200px]"
                  onClick={() => handleAutoGenAndSave(true)}
                  disabled={!canAutoGen || loading}
                  title="Desa el borrador i el confirma alhora, sense editar-lo a la taula de borradors."
                >
                  {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {loading ? 'Processant…' : 'Guardar directament'}
                </Button>
              ) : null}
              <Button
                className="bg-blue-600 text-white gap-2 hover:bg-blue-700 sm:min-w-[220px]"
                type="button"
                onClick={() => handleAutoGenAndSave(false)}
                disabled={!canAutoGen || loading}
              >
                {loading ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {loading
                  ? 'Processant…'
                  : mode === 'manual'
                    ? 'Desar borrador'
                    : 'Auto generar i desa'}
              </Button>
            </DialogFooter>
            {!canAutoGen ? (
              <p className="mt-2 text-[11px] text-slate-500">
                {mode === 'manual'
                  ? 'Omple com a mínim dates i hores per poder desar el borrador.'
                  : 'Omple com a mínim dates i hores per poder auto-generar.'}
              </p>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
import { TRANSPORT_TYPE_LABELS, normalizeTransportType } from '@/lib/transportTypes'
import { canDriverHandleVehicleType } from '@/lib/driverCapabilities'

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

const CUINA_VEHICLE_TYPE_OPTIONS = [
  'camioPPlataforma',
  'furgonetaPetita',
  'furgonetaMitjana',
  'furgonetaGran',
  'camioPPlataformaFred',
] as const

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
  }
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
  const visibleDate = extractDate(event.start)
  const eventRangeStart = extractDate(event.originalStart || event.start)
  const eventRangeEnd = extractDate(event.originalEnd || event.end || event.start)
  const multiDayDates = useMemo(
    () => getDateRange(event.originalStart || event.start, event.originalEnd || event.end || event.start),
    [event.end, event.originalEnd, event.originalStart, event.start]
  )
  const isMultiDayEvent = multiDayDates.length > 1
  const generationScopeToggle = isMultiDayEvent ? (
    <div className="flex items-center justify-end">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-1 shadow-sm">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={generationScope === 'day'}
          className={
            generationScope === 'day'
              ? 'h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-600'
              : 'h-7 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700'
          }
          onClick={() => setGenerationScope('day')}
        >
          1 dia
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={generationScope === 'event'}
          className={
            generationScope === 'event'
              ? 'h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-600'
              : 'h-7 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-700'
          }
          onClick={() => setGenerationScope('event')}
        >
          Multi dia
        </Button>
      </div>
    </div>
  ) : null

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
  }, [open, event.id, visibleDate])

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
              {generationScopeToggle}
            </div>
          )}

          {isServeis && (
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
              {generationScopeToggle}
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
              {generationScopeToggle}
            </div>
          )}

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
            <div className="space-y-3 rounded-2xl border border-dashed border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Fase cuina</p>
                  <p className="text-xs text-slate-500">
                    Treballadors {cuinaTotals.workers} · Conductors {cuinaTotals.drivers} · Grups {cuinaTotals.responsables}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {cuinaGroups.map((group, idx) => (
                  <div key={group.id} className="border border-slate-200 rounded-xl bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Grup {idx + 1}</span>
                      {cuinaGroups.length > 1 && (
                        <button type="button" className="text-red-500 hover:underline" onClick={() => removeCuinaGroup(group.id)}>
                          Elimina grup
                        </button>
                        )}
                      </div>
                    <div className="grid gap-3 lg:grid-cols-[64px_minmax(220px,1fr)_110px_110px_minmax(220px,1fr)_130px_130px_130px] lg:items-end">
                      <div className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                        <Switch
                          id={`cuina-needs-responsible-${group.id}`}
                          checked={group.wantsResponsible}
                          onCheckedChange={(checked) =>
                            updateCuinaGroup(group.id, {
                              wantsResponsible: Boolean(checked),
                              responsibleId:
                                checked && !group.responsibleId && manualResp && manualResp !== '__auto__'
                                  ? manualResp
                                  : checked
                                  ? group.responsibleId
                                  : '',
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Responsable</Label>
                        {group.wantsResponsible ? (
                          <Select
                            value={group.responsibleId || '__auto__'}
                            onValueChange={(value) =>
                              updateCuinaGroup(group.id, { responsibleId: value === '__auto__' ? '' : value })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Responsable del grup…" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__auto__">Automàtic</SelectItem>
                              {availableResponsables.map((resp) => (
                                <SelectItem key={resp.id} value={resp.id}>
                                  {resp.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex h-10 items-center rounded-md border border-slate-200 px-3 text-sm text-slate-400">
                            Sense responsable
                          </div>
                        )}
                      </div>
                      <div>
                        <Label>Conductors</Label>
                        <Input
                          type="number"
                          min={0}
                          value={group.drivers}
                          onChange={(e) =>
                            updateCuinaGroup(group.id, {
                              drivers: Number.isNaN(Number(e.target.value))
                                ? 0
                                : Math.max(0, Number(e.target.value)),
                              needsDriver: Number(e.target.value) > 0,
                              ...(Number(e.target.value) > 0
                                ? {}
                                : {
                                    driverMode: '__auto__',
                                    vehicleType: '',
                                  }),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Treballadors</Label>
                        <Input
                          type="number"
                          min={0}
                          value={group.workers}
                          onChange={(e) =>
                            updateCuinaGroup(group.id, {
                              workers: Number.isNaN(Number(e.target.value)) ? 0 : Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Meeting point</Label>
                        <Input value={group.meetingPoint} onChange={(e) => updateCuinaGroup(group.id, { meetingPoint: e.target.value })} />
                      </div>
                      <div>
                        <Label>Hora Inici</Label>
                        <Input type="time" value={group.startTime} onChange={(e) => updateCuinaGroup(group.id, { startTime: e.target.value })} />
                      </div>
                      <div>
                        <Label>Hora Fi</Label>
                        <Input type="time" value={group.endTime} onChange={(e) => updateCuinaGroup(group.id, { endTime: e.target.value })} />
                      </div>
                      <div>
                        <Label>Hora arribada</Label>
                        <Input type="time" value={group.arrivalTime} onChange={(e) => updateCuinaGroup(group.id, { arrivalTime: e.target.value })} />
                      </div>
                    </div>
                    {Number(group.drivers || 0) > 0 && (
                      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(280px,1fr)] lg:items-end">
                          <div>
                            <Label>Tipus de vehicle</Label>
                            <Select
                              value={group.vehicleType || '__none__'}
                              onValueChange={(value) =>
                                updateCuinaGroup(group.id, {
                                  vehicleType: value === '__none__' ? '' : value,
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecciona tipus de vehicle…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Sense tipus concret —</SelectItem>
                                {CUINA_VEHICLE_TYPE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {TRANSPORT_TYPE_LABELS[option] || option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Conductor</Label>
                            <Select
                              value={group.driverMode || '__auto__'}
                              onValueChange={(value) =>
                                updateCuinaGroup(group.id, { driverMode: value })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecciona conductor…" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__auto__">— Automatic segons disponibilitat —</SelectItem>
                                {group.wantsResponsible &&
                                  (group.responsibleId || (manualResp && manualResp !== '__auto__')) &&
                                  availableConductors.some((conductor) => {
                                    const responsibleId =
                                      group.responsibleId || (manualResp !== '__auto__' ? manualResp : '')
                                    return (
                                      conductor.id === responsibleId &&
                                      canDriverHandleVehicleType(conductor, group.vehicleType || '')
                                    )
                                  }) && (
                                    <SelectItem value="__responsable__">
                                      Responsable
                                    </SelectItem>
                                  )}
                                {availableConductors
                                  .filter(
                                    (conductor) =>
                                      conductor.id === group.driverMode ||
                                      canDriverHandleVehicleType(conductor, group.vehicleType || '')
                                  )
                                  .map((conductor) => (
                                  <SelectItem key={conductor.id} value={conductor.id}>
                                    {conductor.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex justify-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-slate-900 border-slate-200 bg-white shadow-sm"
                      onClick={() =>
                        setCuinaEtt((prev) => ({ ...prev, open: !prev.open }))
                      }
                    >
                      {cuinaEtt.open ? 'Amaga ETT' : '+ ETT'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={addCuinaGroup}>
                      + Grup
                    </Button>
                  </div>
                </div>
                {cuinaEtt.open ? (
                  <div className="space-y-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-3 lg:grid-cols-[160px_170px_170px_130px_130px_minmax(260px,1fr)] lg:items-end">
                      <div>
                        <Label>Treballadors ETT</Label>
                        <Input
                          type="number"
                          min={0}
                          value={cuinaEtt.data.workers}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, workers: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Data inici</Label>
                        <Input
                          type="date"
                          value={cuinaEtt.data.serviceDate}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, serviceDate: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Data fi</Label>
                        <Input
                          type="date"
                          value={cuinaEtt.data.serviceDate}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, serviceDate: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Hora inici</Label>
                        <Input
                          type="time"
                          value={cuinaEtt.data.startTime}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, startTime: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Hora fi</Label>
                        <Input
                          type="time"
                          value={cuinaEtt.data.endTime}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, endTime: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Lloc</Label>
                        <Input
                          value={cuinaEtt.data.meetingPoint}
                          onChange={(e) =>
                            setCuinaEtt((prev) => ({
                              ...prev,
                              data: { ...prev.data, meetingPoint: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    ETT · {cuinaEtt.data.workers || '0'} treballadors
                  </p>
                )}
              </div>
            </div>
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

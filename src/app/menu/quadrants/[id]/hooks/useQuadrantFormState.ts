import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAvailablePersonnel } from '@/app/menu/quadrants/[id]/hooks/useAvailablePersonnel'
import { useLogisticsPhasesState } from '@/app/menu/quadrants/[id]/hooks/useLogisticsPhasesState'
import { useServicePhasesState } from '@/app/menu/quadrants/[id]/hooks/useServicePhasesState'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import {
  logisticPhaseOptions,
  servicePhaseOptions,
  LogisticPhaseForm,
  LogisticPhaseSetting,
  ServicePhaseSetting,
  ServicePhaseEtt,
  ServicePhaseEttData,
  ServeiGroup,
  ServiceJamoneroAssignment,
  VehicleAssignment,
  AvailableVehicle,
  AvailableConductor,
  LogisticPhaseKey,
  ServicePhaseKey,
} from '../phaseConfig'

const extractDate = (iso = '') => iso.split('T')[0] || ''
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

export type EttEntry = {
  name: 'ETT'
  workers: number
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  meetingPoint: string
}

export type ServiceGroupPayload = {
  serviceDate: string
  dateLabel: string | null
  meetingPoint: string
  startTime: string
  endTime: string
  workers: number
  jamoneros: number
  drivers: number
  needsDriver: boolean
  driverId: string | null
  responsibleId: string | null
  responsibleName: string | null
  wantsResponsible: boolean
}

export type LogisticPhasePayload = {
  label: string
  phaseType: LogisticPhaseKey
  date: string
  endDate: string
  startTime: string
  endTime: string
  totalWorkers: number
  numDrivers: number
  wantsResp: boolean
  responsableId: string | null
  meetingPoint: string
  vehicles: Array<{
    id: string
    plate: string
    vehicleType: string
    conductorId: string | null
    arrivalTime?: string
  }>
  timetables: Array<{ startTime: string; endTime: string }>
}

export type ServiceJamoneroPayload = {
  id: string
  mode: 'auto' | 'manual'
  personnelId: string | null
}


export interface QuadrantFormState {
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
  startTime: string
  setStartTime: (value: string) => void
  endTime: string
  setEndTime: (value: string) => void
  arrivalTime: string
  setArrivalTime: (value: string) => void
  location: string
  setLocation: (value: string) => void
  meetingPoint: string
  setMeetingPoint: (value: string) => void
  manualResp: string
  setManualResp: (value: string) => void
  totalWorkers: string
  setTotalWorkers: (value: string) => void
  numDrivers: string
  setNumDrivers: (value: string) => void
  phaseForms: Record<LogisticPhaseKey, LogisticPhaseForm>
  updatePhaseForm: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseForm>) => void
  phaseVisibility: Record<LogisticPhaseKey, boolean>
  togglePhaseVisibility: (key: LogisticPhaseKey) => void
  phaseSettings: Record<LogisticPhaseKey, LogisticPhaseSetting>
  updatePhaseSetting: (key: LogisticPhaseKey, patch: Partial<LogisticPhaseSetting>) => void
  phaseResponsibles: Record<LogisticPhaseKey, string>
  updatePhaseResponsible: (key: LogisticPhaseKey, value: string) => void
  phaseVehicleAssignments: Record<LogisticPhaseKey, VehicleAssignment[]>
  updatePhaseVehicleAssignment: (key: LogisticPhaseKey, index: number, patch: Partial<VehicleAssignment>) => void
  availableVehicles: AvailableVehicle[]
  servicePhaseGroups: ServeiGroup[]
  servicePhaseSettings: Record<ServicePhaseKey, ServicePhaseSetting>
  toggleServicePhaseSelection: (key: ServicePhaseKey) => void
  updateServicePhaseSetting: (key: ServicePhaseKey, patch: Partial<ServicePhaseSetting>) => void
  servicePhaseVisibility: Record<ServicePhaseKey, boolean>
  toggleServicePhaseVisibility: (key: ServicePhaseKey) => void
  addServiceGroup: (phaseKey: ServicePhaseKey) => void
  updateServiceGroup: (id: string, patch: Partial<ServeiGroup>) => void
  removeServiceGroup: (id: string, phaseKey: ServicePhaseKey) => void
  servicePhaseEtt: Record<ServicePhaseKey, ServicePhaseEtt>
  toggleServicePhaseEtt: (key: ServicePhaseKey) => void
  updateServicePhaseEtt: (key: ServicePhaseKey, patch: Partial<ServicePhaseEttData>) => void
  ettOpen: boolean
  setEttOpen: (value: boolean) => void
  ettData: ServicePhaseEttData
  setEttData: (value: ServicePhaseEttData) => void
  availableResponsables: Array<{ id: string; name: string }>
  availableConductors: AvailableConductor[]
  availableJamoneros: Array<{ id: string; name: string }>
  serviceTotals: {
    workers: number
    drivers: number
    responsables: number
    jamoneros: number
  }
  buildServiceGroupsPayload: (
    manualResponsibleId: string | null,
    manualResponsibleName?: string | null
  ) => ServiceGroupPayload[]
  serviceJamoneroAssignments: ServiceJamoneroAssignment[]
  setServiceJamoneroCount: (count: number) => void
  updateServiceJamoneroAssignment: (id: string, patch: Partial<ServiceJamoneroAssignment>) => void
  vehiclesPayload: LogisticPhasePayload['vehicles']
  buildVehiclesPayloadForPhase: (phaseKey: LogisticPhaseKey) => LogisticPhasePayload['vehicles']
  buildLogisticaPhases: () => LogisticPhasePayload[]
  ettEntry: EttEntry | null
}

export function useQuadrantFormState({
  event,
  department,
  modalOpen,
}: {
  event: QuadrantEvent
  department: string
  modalOpen: boolean
}): QuadrantFormState {
  const [startDate, setStartDate] = useState(extractDate(event.start))
  const [endDate, setEndDate] = useState(extractDate(event.start))
  const [startTime, setStartTime] = useState(event.startTime || '')
  const [endTime, setEndTime] = useState(event.endTime || '')
  const [arrivalTime, setArrivalTime] = useState(event.arrivalTime || '')
  const [location, setLocation] = useState(event.location || event.eventLocation || '')
  const [meetingPoint, setMeetingPoint] = useState(event.meetingPoint || '')
  const [manualResp, setManualResp] = useState('')
  const [totalWorkers, setTotalWorkers] = useState(event.totalWorkers?.toString() || '')
  const [numDrivers, setNumDrivers] = useState(event.numDrivers?.toString() || '')
  const defaultPhaseForm = useMemo(
    () => ({
      startDate,
      endDate,
      startTime,
      endTime,
      workers: Number(totalWorkers) || 0,
      drivers: Number(numDrivers) || 0,
      meetingPoint: meetingPoint || location || event.eventLocation || '',
    }),
    [startDate, endDate, startTime, endTime, totalWorkers, numDrivers, meetingPoint, location, event.eventLocation]
  )
  const [ettOpen, setEttOpen] = useState(false)
  const [ettData, setEttData] = useState<ServicePhaseEttData>({
    serviceDate: extractDate(event.start),
    meetingPoint: event.location || event.eventLocation || '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    workers: '',
  })

  const totalWorkersNumber = Number(totalWorkers) || 0
  const numDriversNumber = Number(numDrivers) || 0

  const { responsables, conductors, treballadors } = useAvailablePersonnel({
    departament: department,
    startDate,
    endDate,
    startTime,
    endTime,
  })

  const availableResponsables = useMemo(
    () => responsables.filter((r) => Boolean(r.id?.trim())),
    [responsables]
  )
  const availableConductors = useMemo<AvailableConductor[]>(
    () => conductors.filter((c) => Boolean(c.id?.trim())),
    [conductors]
  )
  const availableJamoneros = useMemo(
    () =>
      [...responsables, ...conductors, ...treballadors]
        .filter((person) => person.isJamonero === true && Boolean(person.id?.trim()))
        .filter(
          (person, index, arr) =>
            arr.findIndex((candidate) => candidate.id === person.id) === index
        )
        .map((person) => ({ id: person.id, name: person.name })),
    [conductors, responsables, treballadors]
  )

  const logistics = useLogisticsPhasesState({
    event,
    department,
    startDate,
    endDate,
    startTime,
    endTime,
    meetingPoint,
    location,
    totalWorkers: totalWorkersNumber,
    numDrivers: numDriversNumber,
    availableConductors,
  })

  const services = useServicePhasesState({
    event,
    department,
    meetingPoint,
    location,
    startTime,
    endTime,
    totalWorkers: totalWorkersNumber,
    modalOpen,
  })

  const {
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
    loadingVehicles,
    normalizeVehicleType,
    isVehicleIdAssigned,
    availableVehicleCount,
    buildVehiclesPayload,
    buildVehiclesPayloadForPhase,
    selectedLogisticPhaseKeys,
    totalDriverCount,
  } = logistics

  const {
    servicePhaseGroups,
    addServiceGroup,
    updateServiceGroup,
    removeServiceGroup,
    servicePhaseSettings,
    toggleServicePhaseSelection,
    updateServicePhaseSetting,
    servicePhaseVisibility,
    toggleServicePhaseVisibility,
    servicePhaseEtt,
    toggleServicePhaseEtt,
    updateServicePhaseEtt,
    serviceTotals,
    serviceJamoneroAssignments,
    setServiceJamoneroCount,
    updateServiceJamoneroAssignment,
    buildServiceGroupsPayload,
  } = services

  const ettEntry = useMemo(() => {
    const workers = Number(ettData.workers || 0)
    if (!workers) return null
    return {
      name: 'ETT' as const,
      workers,
      startDate: ettData.serviceDate || startDate,
      endDate: ettData.serviceDate || endDate,
      startTime: ettData.startTime || startTime,
      endTime: ettData.endTime || endTime,
      meetingPoint: ettData.meetingPoint || meetingPoint || location || '',
    }
  }, [ettData, startDate, endDate, startTime, endTime, meetingPoint, location])

  const buildTimetablesForPhase = useCallback(
    (form: LogisticPhaseForm) => {
      const list: Array<{ startTime: string; endTime: string }> = []
      const add = (entry: { startTime: string; endTime: string }) => {
        const tt = collectTimetable(entry)
        if (tt) list.push(tt)
      }
      add({ startTime: form.startTime, endTime: form.endTime })
      if (ettEntry) {
        add({ startTime: ettEntry.startTime, endTime: ettEntry.endTime })
      }
      return list
    },
    [ettEntry]
  )

  const getManualResponsible = useCallback(
    (phaseKey: LogisticPhaseKey) => {
      const entry = phaseResponsibles[phaseKey] ?? '__auto__'
      return entry && entry !== '__auto__' ? entry : null
    },
    [phaseResponsibles]
  )

  const vehiclesPayload = useMemo(() => buildVehiclesPayload(), [buildVehiclesPayload])

  const buildLogisticaPhases = useCallback(
    () => {
      const baseMeetingPoint = meetingPoint || location || event.eventLocation || ''
      return selectedLogisticPhaseKeys.map((phaseKey) => {
        const form = phaseForms[phaseKey] ?? defaultPhaseForm
        const phaseSetting = phaseSettings[phaseKey] ?? { selected: true, needsResponsible: true }
        const phaseTimetables = buildTimetablesForPhase(form)
        const label = logisticPhaseOptions.find((phase) => phase.key === phaseKey)?.label || phaseKey
        const phaseVehicles = buildVehiclesPayloadForPhase(phaseKey)
        return {
          label,
          phaseType: phaseKey,
          date: form.startDate,
          endDate: form.endDate,
          startTime: form.startTime,
          endTime: form.endTime,
          totalWorkers: form.workers,
          numDrivers: form.drivers,
          wantsResp: phaseSetting.needsResponsible,
          responsableId: phaseSetting.needsResponsible ? getManualResponsible(phaseKey) : null,
          meetingPoint: form.meetingPoint || baseMeetingPoint,
          vehicles: phaseVehicles,
          timetables: phaseTimetables,
        }
      })
    },
    [
      buildTimetablesForPhase,
      defaultPhaseForm,
      event.eventLocation,
      event.phaseKey,
      location,
      meetingPoint,
      phaseForms,
      phaseSettings,
      selectedLogisticPhaseKeys,
      getManualResponsible,
      buildVehiclesPayloadForPhase,
    ]
  )
  const syncNumDrivers = useMemo(() => {
    return logisticPhaseOptions.reduce((sum, phase) => sum + (phaseForms[phase.key]?.drivers || 0), 0)
  }, [phaseForms])

  useEffect(() => {
    if (!modalOpen) return

    setStartDate(extractDate(event.start))
    setEndDate(extractDate(event.start))
    setStartTime(event.startTime || '')
    setEndTime(event.endTime || '')
    setArrivalTime(event.arrivalTime || '')
    setLocation(event.location || event.eventLocation || '')
    setMeetingPoint(event.meetingPoint || '')
    setManualResp('')
    setTotalWorkers(event.totalWorkers?.toString() || '')
    setNumDrivers(event.numDrivers?.toString() || '')
    setEttOpen(false)
    setEttData({
      serviceDate: extractDate(event.start),
      meetingPoint: event.location || event.eventLocation || '',
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      workers: '',
    })
  }, [
    modalOpen,
    event.id,
    event.start,
    event.startTime,
    event.endTime,
    event.arrivalTime,
    event.location,
    event.eventLocation,
    event.meetingPoint,
    event.totalWorkers,
    event.numDrivers,
  ])

  useEffect(() => {
    setNumDrivers(syncNumDrivers.toString())
  }, [syncNumDrivers])

  return {
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
    buildVehiclesPayloadForPhase,
    buildLogisticaPhases,
    ettEntry,
    availableResponsables,
    availableConductors,
    availableJamoneros,
  }
}

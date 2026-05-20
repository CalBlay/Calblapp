'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type {
  CuinaDriverAssignment,
  CuinaEttState,
  CuinaGroup,
  QuadrantMode,
} from '../components/quadrantModalTypes'
import { extractDate, makeGroupId } from '../components/quadrantModalUtils'

type ConductorOption = { id: string; name?: string }

type UseCuinaStateParams = {
  open: boolean
  isCuina: boolean
  mode: QuadrantMode
  event: QuadrantEvent
  totalWorkers: string | number
  numDrivers: string | number
  meetingPoint: string
  setMeetingPoint: (value: string) => void
  startTime: string
  setStartTime: (value: string) => void
  endTime: string
  setEndTime: (value: string) => void
  arrivalTime: string
  setArrivalTime: (value: string) => void
  manualResp: string
  availableConductors: ConductorOption[]
}

type UseCuinaStateResult = {
  cuinaGroups: CuinaGroup[]
  setCuinaGroups: React.Dispatch<React.SetStateAction<CuinaGroup[]>>
  cuinaEtt: CuinaEttState
  setCuinaEtt: React.Dispatch<React.SetStateAction<CuinaEttState>>
  cuinaTotals: { workers: number; drivers: number; responsables: number }
  isManualResponsibleConductor: boolean
  cuinaVehiclesPayload: Array<{
    id: string
    plate: string
    vehicleType: string
    conductorId: string | null
    arrivalTime: string
  }>
  addCuinaGroup: () => void
  updateCuinaGroup: (id: string, patch: Partial<CuinaGroup>) => void
  removeCuinaGroup: (id: string) => void
}

export function useCuinaState({
  open,
  isCuina,
  mode,
  event,
  totalWorkers,
  numDrivers,
  meetingPoint,
  setMeetingPoint,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  arrivalTime,
  setArrivalTime,
  manualResp,
  availableConductors,
}: UseCuinaStateParams): UseCuinaStateResult {
  const buildDriverAssignments = useCallback(
    (
      drivers: number,
      existing?: CuinaDriverAssignment[],
      fallback?: Partial<CuinaGroup>
    ): CuinaDriverAssignment[] => {
      const count = Math.max(0, Number(drivers) || 0)
      const source = Array.isArray(existing) ? existing : []
      return Array.from({ length: count }, (_, idx) => ({
        vehicleType: source[idx]?.vehicleType ?? (idx === 0 ? fallback?.vehicleType ?? '' : ''),
        driverMode: source[idx]?.driverMode ?? (idx === 0 ? fallback?.driverMode ?? '__auto__' : '__auto__'),
      }))
    },
    []
  )

  const normalizeGroupDrivers = useCallback(
    (group: CuinaGroup): CuinaGroup => {
      const normalizedDrivers = Math.max(0, Number(group.drivers) || 0)
      const driverAssignments = buildDriverAssignments(normalizedDrivers, group.driverAssignments, group)
      return {
        ...group,
        drivers: normalizedDrivers,
        needsDriver: normalizedDrivers > 0,
        driverAssignments,
        driverMode: driverAssignments[0]?.driverMode ?? '__auto__',
        vehicleType: driverAssignments[0]?.vehicleType ?? '',
      }
    },
    [buildDriverAssignments]
  )

  const createCuinaGroup = useCallback(
    (seed: Partial<CuinaGroup> = {}): CuinaGroup => {
      const seedDrivers = Math.max(0, (seed.drivers ?? Number(numDrivers)) || 0)
      const needsDriver = seed.needsDriver ?? seedDrivers > 0
      const driverAssignments = buildDriverAssignments(seedDrivers, seed.driverAssignments, seed)

      return normalizeGroupDrivers({
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
        driverMode: driverAssignments[0]?.driverMode ?? seed.driverMode ?? '__auto__',
        vehicleType: driverAssignments[0]?.vehicleType ?? seed.vehicleType ?? '',
        driverAssignments,
        workerIds: Array.isArray(seed.workerIds) ? [...seed.workerIds] : [],
        workerDetails: seed.workerDetails ? { ...seed.workerDetails } : {},
      })
    },
    [arrivalTime, meetingPoint, numDrivers, startTime, endTime, totalWorkers, buildDriverAssignments, normalizeGroupDrivers]
  )

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
        .flatMap((group) =>
          (group.driverAssignments || []).map((assignment) => {
            let conductorId: string | null = null
            if (assignment.driverMode === '__responsable__') {
              conductorId =
                group.responsibleId ||
                (manualResp && manualResp !== '__auto__' ? manualResp : null)
            } else if (assignment.driverMode && assignment.driverMode !== '__auto__') {
              conductorId = assignment.driverMode
            }

            return {
              id: '',
              plate: '',
              vehicleType: assignment.vehicleType || '',
              conductorId,
              arrivalTime: group.arrivalTime || '',
            }
          })
        )
        .filter((vehicle) => Boolean(vehicle.id || vehicle.vehicleType || vehicle.conductorId)),
    [cuinaGroups, manualResp]
  )

  // Si hi ha un sol grup i els totals "tracen" l'última sincronització, propaga els canvis.
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
      return [normalizeGroupDrivers({ ...first, workers: targetWorkers, drivers: targetDrivers }), ...prev.slice(1)]
    })
    cuinaTotalsRef.current = { workers: targetWorkers, drivers: targetDrivers }
  }, [
    createCuinaGroup,
    isCuina,
    normalizeGroupDrivers,
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

  // Reseteja l'estat ETT cada vegada que canvia l'esdeveniment o s'obre el modal.
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
  }, [
    isCuina,
    open,
    event.id,
    event.start,
    event.startTime,
    event.endTime,
    event.location,
    event.eventLocation,
  ])

  // El meetingPoint del primer grup mana sobre el del modal.
  useEffect(() => {
    if (!isCuina) return
    const firstPoint = cuinaGroups[0]?.meetingPoint || ''
    if (firstPoint !== meetingPoint) {
      setMeetingPoint(firstPoint)
    }
  }, [cuinaGroups, isCuina, meetingPoint, setMeetingPoint])

  // Si tens un sol grup amb responsable demanat, autoassigna el manualResp.
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

  // Sincronitza les hores del primer grup cap a les hores globals del modal.
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

  const updateCuinaGroup = useCallback((id: string, patch: Partial<CuinaGroup>) => {
    setCuinaGroups((prev) =>
      prev.map((group) =>
        group.id === id ? normalizeGroupDrivers({ ...group, ...patch }) : group
      )
    )
  }, [normalizeGroupDrivers])

  const addCuinaGroup = useCallback(() => {
    setCuinaGroups((prev) => [
      ...prev,
      createCuinaGroup({
        workers: 0,
        drivers: 0,
        needsDriver: false,
        wantsResponsible: false,
      }),
    ])
  }, [createCuinaGroup])

  const removeCuinaGroup = useCallback(
    (id: string) => {
      setCuinaGroups((prev) => {
        const next = prev.filter((group) => group.id !== id)
        return next.length
          ? next
          : [createCuinaGroup({ workers: 0, drivers: 0, needsDriver: false })]
      })
    },
    [createCuinaGroup]
  )

  return {
    cuinaGroups,
    setCuinaGroups,
    cuinaEtt,
    setCuinaEtt,
    cuinaTotals,
    isManualResponsibleConductor,
    cuinaVehiclesPayload,
    addCuinaGroup,
    updateCuinaGroup,
    removeCuinaGroup,
  }
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import type {
  CuinaEttState,
  CuinaGroup,
  QuadrantMode,
} from '../components/quadrantModalTypes'
import { extractDate, makeGroupId } from '../components/quadrantModalUtils'
import { useAvailableVehicles } from '@/hooks/logistics/useAvailableVehicles'
import { normalizeTransportType } from '@/lib/transportTypes'
import {
  ensureCuinaVehicleAssignments,
  syncCuinaGroupFromRoleLines,
  countCuinaStaffTotals,
  type CuinaStaffTotals,
} from '../lib/cuinaGroupRoleLines'

import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import { hydrateCuinaGroupsFromDraft } from '../lib/hydrateCuinaGroupsFromDraft'

type ConductorOption = { id: string; name?: string }

type UseCuinaStateParams = {
  open: boolean
  isCuina: boolean
  department: string
  mode: QuadrantMode
  event: QuadrantEvent
  existingDraft?: EditorDraftInput | null
  startDate: string
  endDate: string
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
  cuinaTotals: CuinaStaffTotals
  isManualResponsibleConductor: boolean
  cuinaVehiclesPayload: Array<{
    id: string
    plate: string
    vehicleType: string
    conductorId: string | null
    arrivalTime: string
  }>
  availableVehicles: ReturnType<typeof useAvailableVehicles>['vehicles']
  availableVehicleCount: number
  isVehicleIdAssigned: (vehicleId: string, groupId: string, slotId: string) => boolean
  toggleCuinaEtt: () => void
  updateCuinaEtt: (patch: Partial<CuinaEttState['data']>) => void
  addCuinaGroup: () => void
  updateCuinaGroup: (id: string, patch: Partial<CuinaGroup>) => void
  removeCuinaGroup: (id: string) => void
}

export function useCuinaState({
  open,
  isCuina,
  department,
  mode: _mode,
  event,
  existingDraft,
  startDate,
  endDate,
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
  const eventServiceDate = extractDate(event.start)

  const buildDriverAssignments = useCallback(
    (
      drivers: number,
      existing?: CuinaGroup['driverAssignments'],
      fallback?: Partial<CuinaGroup>
    ): NonNullable<CuinaGroup['driverAssignments']> => {
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
      if (Array.isArray(group.roleLines) && group.roleLines.length > 0) {
        return syncCuinaGroupFromRoleLines(
          group,
          group.roleLines,
          ensureCuinaVehicleAssignments(group)
        )
      }
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
        serviceDate: seed.serviceDate || eventServiceDate,
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
        roleLines: seed.roleLines,
        vehicleAssignments: seed.vehicleAssignments,
      })
    },
    [
      arrivalTime,
      eventServiceDate,
      meetingPoint,
      numDrivers,
      startTime,
      endTime,
      totalWorkers,
      buildDriverAssignments,
      normalizeGroupDrivers,
    ]
  )

  const [cuinaGroups, setCuinaGroups] = useState<CuinaGroup[]>(() => [createCuinaGroup()])
  const [cuinaEtt, setCuinaEtt] = useState<CuinaEttState>(() => ({
    open: false,
    data: {
      serviceDate: eventServiceDate,
      meetingPoint: 'CENTRAL',
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      workers: '',
    },
  }))
  const cuinaTotalsRef = useRef({ workers: Number(totalWorkers) || 0, drivers: Number(numDrivers) || 0 })

  const totalWorkersNumber = Number(totalWorkers) || 0
  const numDriversNumber = Number(numDrivers) || 0

  const { vehicles: availableVehicles, loading: loadingVehicles } = useAvailableVehicles({
    startDate,
    startTime,
    endDate,
    endTime,
    department,
    enabled:
      isCuina &&
      department.toLowerCase() === 'cuina' &&
      Boolean(startDate && startTime && endDate && endTime),
  })

  const availableVehicleCount = useMemo(
    () => availableVehicles.filter((vehicle) => vehicle.available).length,
    [availableVehicles]
  )

  const cuinaTotals = useMemo(
    () => countCuinaStaffTotals(cuinaGroups, manualResp),
    [cuinaGroups, manualResp]
  )

  const isManualResponsibleConductor = useMemo(() => {
    if (!manualResp || manualResp === '__auto__') return false
    return availableConductors.some((conductor) => conductor.id === manualResp)
  }, [availableConductors, manualResp])

  const cuinaVehiclesPayload = useMemo(
    () =>
      cuinaGroups.flatMap((group) =>
        ensureCuinaVehicleAssignments(group).flatMap((assignment) => {
          const matched = availableVehicles.find((vehicle) => vehicle.id === assignment.vehicleId)
          const vehicleType =
            normalizeTransportType(assignment.vehicleType || matched?.type || '') ||
            normalizeTransportType(matched?.type || '')
          if (!vehicleType && !assignment.vehicleId && !assignment.conductorId) return []
          return [
            {
              id: assignment.vehicleId || '',
              plate: assignment.plate || matched?.plate || '',
              vehicleType,
              conductorId: assignment.conductorId || null,
              arrivalTime: assignment.arrivalTime || group.arrivalTime || '',
            },
          ]
        })
      ),
    [availableVehicles, cuinaGroups]
  )

  const isVehicleIdAssigned = useCallback(
    (vehicleId: string, groupId: string, slotId: string) => {
      if (!vehicleId) return false
      return cuinaGroups.some((group) =>
        ensureCuinaVehicleAssignments(group).some(
          (assignment) =>
            assignment.vehicleId === vehicleId &&
            !(group.id === groupId && assignment.slotId === slotId)
        )
      )
    },
    [cuinaGroups]
  )

  useEffect(() => {
    if (!isCuina || !open) return
    if (!existingDraft?.id) return
    setCuinaGroups(
      hydrateCuinaGroupsFromDraft({
        draft: existingDraft,
        fallback: createCuinaGroup(),
      })
    )
  }, [
    createCuinaGroup,
    existingDraft,
    isCuina,
    open,
  ])

  useEffect(() => {
    if (!isCuina) return
    const targetWorkers = totalWorkersNumber
    const targetDrivers = numDriversNumber
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
    totalWorkersNumber,
    numDriversNumber,
  ])

  useEffect(() => {
    if (!isCuina) return
    setCuinaEtt({
      open: false,
      data: {
        serviceDate: eventServiceDate,
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
    eventServiceDate,
  ])

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
    if (firstGroup.startTime && firstGroup.startTime !== startTime) setStartTime(firstGroup.startTime)
    else if (!startTime && firstGroup.startTime) setStartTime(firstGroup.startTime)
    if (firstGroup.endTime && firstGroup.endTime !== endTime) setEndTime(firstGroup.endTime)
    else if (!endTime && firstGroup.endTime) setEndTime(firstGroup.endTime)
    if (firstGroup.arrivalTime && firstGroup.arrivalTime !== arrivalTime) {
      setArrivalTime(firstGroup.arrivalTime)
    }
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

  useEffect(() => {
    if (!isCuina || !availableVehicles.length) return
    setCuinaGroups((prev) => {
      let changed = false
      const next = prev.map((group) => {
        const assignments = ensureCuinaVehicleAssignments(group)
        const updated = assignments.map((assignment) => {
          if (assignment.vehicleId || !assignment.plate) return assignment
          const matched = availableVehicles.find((vehicle) => vehicle.plate === assignment.plate)
          if (!matched) return assignment
          changed = true
          return {
            ...assignment,
            vehicleId: matched.id,
            vehicleType: assignment.vehicleType || matched.type || '',
          }
        })
        if (!changed) return group
        return { ...group, vehicleAssignments: updated }
      })
      return changed ? next : prev
    })
  }, [availableVehicles, isCuina])

  void loadingVehicles

  const updateCuinaGroup = useCallback(
    (id: string, patch: Partial<CuinaGroup>) => {
      setCuinaGroups((prev) =>
        prev.map((group) => {
          if (group.id !== id) return group
          const merged = { ...group, ...patch }
          const vehicleOnlyPatch =
            Boolean(patch.vehicleAssignments) &&
            patch.roleLines === undefined &&
            patch.workerIds === undefined &&
            patch.workerDetails === undefined &&
            patch.driverAssignments === undefined

          if (Array.isArray(merged.roleLines) && merged.roleLines.length > 0) {
            if (vehicleOnlyPatch) return merged
            return syncCuinaGroupFromRoleLines(
              merged,
              merged.roleLines,
              merged.vehicleAssignments || ensureCuinaVehicleAssignments(merged)
            )
          }
          return normalizeGroupDrivers(merged)
        })
      )
    },
    [normalizeGroupDrivers]
  )

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

  const toggleCuinaEtt = useCallback(() => {
    setCuinaEtt((prev) => ({ ...prev, open: !prev.open }))
  }, [])

  const updateCuinaEtt = useCallback((patch: Partial<CuinaEttState['data']>) => {
    setCuinaEtt((prev) => ({ ...prev, data: { ...prev.data, ...patch } }))
  }, [])

  return {
    cuinaGroups,
    setCuinaGroups,
    cuinaEtt,
    setCuinaEtt,
    cuinaTotals,
    isManualResponsibleConductor,
    cuinaVehiclesPayload,
    availableVehicles,
    availableVehicleCount,
    isVehicleIdAssigned,
    toggleCuinaEtt,
    updateCuinaEtt,
    addCuinaGroup,
    updateCuinaGroup,
    removeCuinaGroup,
  }
}

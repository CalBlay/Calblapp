'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import {
  AvailableVehicle,
  AvailableConductor,
  LogisticPhaseForm,
  LogisticPhaseKey,
  LogisticPhaseSetting,
  VehicleAssignment,
  logisticPhaseOptions,
} from '../phaseConfig'
import { normalizeTransportType } from '@/lib/transportTypes'
import { useAvailableVehicles } from '@/hooks/logistics/useAvailableVehicles'

const extractDate = (iso = '') => iso.split('T')[0] || ''

type PhaseFormParams = {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  workers: number
  drivers: number
  meetingPoint: string
}

const normalizePhaseKey = (value?: string) => {
  const normalized = (value || '').toString().trim().toLowerCase()
  return logisticPhaseOptions.some((phase) => phase.key === normalized)
    ? (normalized as LogisticPhaseKey)
    : null
}

const createPhaseForms = (params: PhaseFormParams) =>
  logisticPhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = {
      startDate: params.startDate,
      endDate: params.endDate,
      startTime: params.startTime,
      endTime: params.endTime,
      workers: params.workers,
      drivers: params.drivers,
      meetingPoint: params.meetingPoint,
      workerIds: [],
      workerDetails: {},
    }
    return acc
  }, {} as Record<LogisticPhaseKey, LogisticPhaseForm>)

const createPhaseVisibility = (initialPhaseKey?: LogisticPhaseKey | null) =>
  logisticPhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = initialPhaseKey ? phase.key === initialPhaseKey : phase.key === 'event'
    return acc
  }, {} as Record<LogisticPhaseKey, boolean>)

const createPhaseSettings = (initialPhaseKey?: LogisticPhaseKey | null) =>
  logisticPhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = {
      selected: initialPhaseKey ? phase.key === initialPhaseKey : phase.key === 'event',
      needsResponsible: initialPhaseKey ? phase.key === initialPhaseKey && phase.key === 'event' : phase.key === 'event',
    }
    return acc
  }, {} as Record<LogisticPhaseKey, LogisticPhaseSetting>)

const createPhaseResponsibles = () =>
  logisticPhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = '__auto__'
    return acc
  }, {} as Record<LogisticPhaseKey, string>)

const createPhaseVehicleAssignments = () =>
  logisticPhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = []
    return acc
  }, {} as Record<LogisticPhaseKey, VehicleAssignment[]>)

const normalizeVehicleType = (value?: string) => normalizeTransportType(value)

type VehiclePayload = {
  id: string
  plate: string
  vehicleType: string
  conductorId: string | null
  arrivalTime?: string
}

type UseLogisticsPhasesStateOptions = {
  event: QuadrantEvent
  department: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  meetingPoint: string
  location: string
  totalWorkers: number
  numDrivers: number
  availableConductors: AvailableConductor[]
  quadrantMode?: 'auto' | 'semi' | 'manual'
}

export type UseLogisticsPhasesStateResult = {
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
  availableConductors: AvailableConductor[]
  loadingVehicles: boolean
  normalizeVehicleType: (value?: string) => string
  isVehicleIdAssigned: (vehicleId: string, currentPhase: LogisticPhaseKey, currentIndex: number) => boolean
  availableVehicleCount: number
  buildVehiclesPayload: () => VehiclePayload[]
  buildVehiclesPayloadForPhase: (phaseKey: LogisticPhaseKey) => VehiclePayload[]
  selectedLogisticPhaseKeys: LogisticPhaseKey[]
  totalDriverCount: number
}

export function useLogisticsPhasesState({
  event,
  department,
  startDate,
  endDate,
  startTime,
  endTime,
  meetingPoint,
  location: _location,
  totalWorkers,
  numDrivers,
  availableConductors,
  quadrantMode = 'semi',
}: UseLogisticsPhasesStateOptions): UseLogisticsPhasesStateResult {
  const requestedPhaseKey = normalizePhaseKey(event.phaseKey || event.phaseType || event.phaseLabel)
  const baseMeetingPoint = meetingPoint || 'CENTRAL'
  const initialPhaseParams: PhaseFormParams = {
    startDate: extractDate(event.start),
    endDate: extractDate(event.start),
    startTime: startTime || '',
    endTime: endTime || '',
    workers: totalWorkers,
    drivers: numDrivers,
    meetingPoint: baseMeetingPoint,
  }

  const [phaseForms, setPhaseForms] = useState<Record<LogisticPhaseKey, LogisticPhaseForm>>(
    () => createPhaseForms(initialPhaseParams)
  )
  const [phaseVisibility, setPhaseVisibility] = useState<Record<LogisticPhaseKey, boolean>>(
    () => createPhaseVisibility(requestedPhaseKey)
  )
  const [phaseSettings, setPhaseSettings] = useState<Record<LogisticPhaseKey, LogisticPhaseSetting>>(
    () => createPhaseSettings(requestedPhaseKey)
  )
  const [phaseResponsibles, setPhaseResponsibles] = useState<Record<LogisticPhaseKey, string>>(
    createPhaseResponsibles
  )
  const [phaseVehicleAssignments, setPhaseVehicleAssignments] = useState<
    Record<LogisticPhaseKey, VehicleAssignment[]>
  >(() => createPhaseVehicleAssignments())
  const {
    vehicles: availableVehicles,
    loading: loadingVehicles,
  } = useAvailableVehicles({
    startDate,
    startTime,
    endDate,
    endTime,
    department,
    enabled:
      (department.toLowerCase() === 'logistica' || department.toLowerCase() === 'cuina') &&
      Boolean(startDate && startTime && endDate && endTime) &&
      !Number.isNaN(totalWorkers),
  })

  /** Evita falsos fotogrames durant salts de semi/auto manual. */
  const prevQuadrantModeRef = useRef(quadrantMode)

  useEffect(() => {
    setPhaseForms((prev) => {
      const next = { ...prev }
      logisticPhaseOptions.forEach((phase) => {
        next[phase.key] = {
          ...next[phase.key],
          startDate: extractDate(event.start),
          endDate: extractDate(event.start),
          startTime: startTime || '',
          endTime: endTime || '',
          meetingPoint: baseMeetingPoint,
        }
      })
      return next
    })

    setPhaseResponsibles((prev) =>
      logisticPhaseOptions.reduce((acc, phase) => {
        acc[phase.key] = prev[phase.key] ?? '__auto__'
        return acc
      }, {} as Record<LogisticPhaseKey, string>)
    )
  }, [event, startTime, endTime, baseMeetingPoint])

  useEffect(() => {
    const params: PhaseFormParams = {
      startDate: extractDate(event.start),
      endDate: extractDate(event.start),
      startTime: startTime || '',
      endTime: endTime || '',
      workers: totalWorkers,
      drivers: numDrivers,
      meetingPoint: baseMeetingPoint,
    }
    setPhaseForms(createPhaseForms(params))
    setPhaseVisibility(createPhaseVisibility(requestedPhaseKey))
    setPhaseSettings(createPhaseSettings(requestedPhaseKey))
    setPhaseResponsibles(createPhaseResponsibles())
    setPhaseVehicleAssignments(createPhaseVehicleAssignments())
  }, [
    baseMeetingPoint,
    endTime,
    event.id,
    event.phaseKey,
    event.phaseLabel,
    event.phaseType,
    event.start,
    numDrivers,
    requestedPhaseKey,
    startTime,
    totalWorkers,
  ])

  const phaseDriversFingerprint = useMemo(
    () => logisticPhaseOptions.map((p) => String(phaseForms[p.key]?.drivers ?? '')).join('|'),
    [phaseForms]
  )

  useEffect(() => {
    setPhaseVehicleAssignments((prev) =>
      logisticPhaseOptions.reduce((acc, phase) => {
        const desired = Math.max(0, Number(phaseForms[phase.key]?.drivers ?? 0) || 0)
        const existing = prev[phase.key] || []
        acc[phase.key] = Array.from({ length: desired }).map((_, idx) => ({
          vehicleType: existing[idx]?.vehicleType || '',
          vehicleId: existing[idx]?.vehicleId || '',
          plate: existing[idx]?.plate || '',
          conductorId: existing[idx]?.conductorId ?? null,
          arrivalTime: existing[idx]?.arrivalTime || '',
        }))
        return acc
      }, {} as Record<LogisticPhaseKey, VehicleAssignment[]>)
    )
  }, [phaseDriversFingerprint])

  const logisticWorkersFingerprint = useMemo(
    () => logisticPhaseOptions.map((p) => String(phaseForms[p.key]?.workers ?? '')).join('|'),
    [phaseForms]
  )

  useEffect(() => {
    setPhaseResponsibles((prev) => {
      let changed = false
      const next = { ...prev }
      for (const phase of logisticPhaseOptions) {
        const v = next[phase.key]
        if (quadrantMode === 'manual') {
          if (v === '__auto__') {
            next[phase.key] = '__manual_pick__'
            changed = true
          }
        } else if (v === '__manual_pick__' || v === '') {
          next[phase.key] = '__auto__'
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [quadrantMode])

  useEffect(() => {
    const enteringManual = quadrantMode === 'manual' && prevQuadrantModeRef.current !== 'manual'
    prevQuadrantModeRef.current = quadrantMode

    if (quadrantMode !== 'manual') return

    setPhaseForms((prev) => {
      let changed = false
      const next = { ...prev }

      for (const phase of logisticPhaseOptions) {
        const f = next[phase.key]
        let raw = Number(f.workers)
        if (!Number.isFinite(raw)) raw = 0

        /**
         * Primer pic en manual: totals d’auto/semi (PAX…) no són “slots” manuals.
         * Evita generar fins a 90 files (30×fases) i el gel de la pantalla.
         */
        let w = Math.max(0, Math.min(30, raw))
        let forceResetDetails = false
        if (enteringManual && raw > 30) {
          w = 0
          forceResetDetails = true
        }

        let ids = Array.isArray(f.workerIds) ? [...f.workerIds] : []
        let details = { ...(f.workerDetails || {}) }
        if (forceResetDetails) {
          ids = []
          details = {}
        }

        const workersSynced = ids.length === w && Number(f.workers) === w
        if (workersSynced) continue

        changed = true
        if (!forceResetDetails && ids.length > w) {
          ids.slice(w).filter(Boolean).forEach((id) => {
            delete details[id]
          })
          ids = ids.slice(0, w)
        } else if (!forceResetDetails) {
          while (ids.length < w) ids.push('')
        }
        next[phase.key] = { ...f, workers: w, workerIds: ids, workerDetails: details }
      }

      return changed ? next : prev
    })
  }, [quadrantMode, logisticWorkersFingerprint])

  const updatePhaseForm = (key: LogisticPhaseKey, patch: Partial<LogisticPhaseForm>) => {
    setPhaseForms((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const togglePhaseVisibility = (key: LogisticPhaseKey) => {
    setPhaseVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const updatePhaseSetting = (key: LogisticPhaseKey, patch: Partial<LogisticPhaseSetting>) => {
    setPhaseSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const updatePhaseResponsible = (key: LogisticPhaseKey, value: string) => {
    setPhaseResponsibles((prev) => ({ ...prev, [key]: value }))
  }

  const updatePhaseVehicleAssignment = (
    key: LogisticPhaseKey,
    index: number,
    patch: Partial<VehicleAssignment>
  ) => {
    setPhaseVehicleAssignments((prev) => {
      const phaseAssignments = prev[key] || []
      if (index < 0 || index >= phaseAssignments.length) return prev
      const updated = [...phaseAssignments]
      updated[index] = { ...updated[index], ...patch }
      return { ...prev, [key]: updated }
    })
  }

  const isVehicleIdAssigned = useCallback(
    (vehicleId: string, currentPhase: LogisticPhaseKey, currentIndex: number) => {
      if (!vehicleId) return false
      for (const phase of logisticPhaseOptions) {
        const assignments = phaseVehicleAssignments[phase.key] || []
        for (let idx = 0; idx < assignments.length; idx += 1) {
          if (phase.key === currentPhase && idx === currentIndex) continue
          if (assignments[idx]?.vehicleId === vehicleId) return true
        }
      }
      return false
    },
    [phaseVehicleAssignments]
  )

  const availableVehicleCount = useMemo(
    () => availableVehicles.filter((vehicle) => vehicle.available).length,
    [availableVehicles]
  )

  const buildVehiclesPayloadForPhase = useCallback(
    (phaseKey: LogisticPhaseKey) => {
      const assignments = phaseVehicleAssignments[phaseKey] || []
      return assignments.flatMap((assignment) => {
        const vehicleId = assignment.vehicleId || ''
        const matched = availableVehicles.find((vehicle) => vehicle.id === vehicleId)
        const vehicleType =
          normalizeVehicleType(assignment.vehicleType || matched?.type || '') ||
          normalizeVehicleType(matched?.type || '')
        if (!vehicleType && !vehicleId && !assignment.conductorId) return []
        return [
          {
            id: vehicleId,
            plate: assignment.plate || matched?.plate || '',
            vehicleType,
            conductorId: assignment.conductorId || matched?.conductorId || null,
            arrivalTime: assignment.arrivalTime || '',
          },
        ]
      })
    },
    [phaseVehicleAssignments, availableVehicles]
  )

  const buildVehiclesPayload = useCallback(
    () => logisticPhaseOptions.flatMap((phase) => buildVehiclesPayloadForPhase(phase.key)),
    [buildVehiclesPayloadForPhase]
  )

  const selectedLogisticPhaseKeys = useMemo(() => {
    const keys = logisticPhaseOptions
      .filter((phase) => phaseSettings[phase.key]?.selected ?? true)
      .map((phase) => phase.key)
    if (keys.length) return keys
    return ['event'] as LogisticPhaseKey[]
  }, [phaseSettings])

  const totalDriverCount = useMemo(
    () =>
      logisticPhaseOptions.reduce((sum, phase) => sum + (phaseForms[phase.key]?.drivers || 0), 0),
    [phaseForms]
  )

  return {
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
    availableConductors,
    loadingVehicles,
    normalizeVehicleType,
    isVehicleIdAssigned,
    availableVehicleCount,
    buildVehiclesPayload,
    buildVehiclesPayloadForPhase,
    selectedLogisticPhaseKeys,
    totalDriverCount,
  }
}

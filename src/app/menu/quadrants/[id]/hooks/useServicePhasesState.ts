'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import {
  ServeiGroup,
  ServicePhaseEtt,
  ServicePhaseEttData,
  ServicePhaseKey,
  ServicePhaseSetting,
  servicePhaseOptions,
} from '../phaseConfig'

const extractDate = (iso = '') => iso.split('T')[0] || ''

const makeGroupId = () => `group-${Date.now()}-${Math.random().toString(16).slice(2)}`

type UseServicePhasesStateOptions = {
  event: QuadrantEvent
  department: string
  meetingPoint: string
  location: string
  startTime: string
  endTime: string
  totalWorkers: number
  modalOpen: boolean
}

export type UseServicePhasesStateResult = {
  servicePhaseGroups: ServeiGroup[]
  addServiceGroup: (phaseKey: ServicePhaseKey) => void
  updateServiceGroup: (id: string, patch: Partial<ServeiGroup>) => void
  removeServiceGroup: (id: string, phaseKey: ServicePhaseKey) => void
  servicePhaseSettings: Record<ServicePhaseKey, ServicePhaseSetting>
  toggleServicePhaseSelection: (key: ServicePhaseKey) => void
  updateServicePhaseSetting: (key: ServicePhaseKey, patch: Partial<ServicePhaseSetting>) => void
  servicePhaseVisibility: Record<ServicePhaseKey, boolean>
  toggleServicePhaseVisibility: (key: ServicePhaseKey) => void
  servicePhaseEtt: Record<ServicePhaseKey, ServicePhaseEtt>
  toggleServicePhaseEtt: (key: ServicePhaseKey) => void
  updateServicePhaseEtt: (key: ServicePhaseKey, patch: Partial<ServicePhaseEttData>) => void
  serviceTotals: {
    workers: number
    drivers: number
    responsables: number
    jamoneros: number
  }
  buildServiceGroupsPayload: (
    manualResponsibleId: string | null,
    manualResponsibleName?: string | null
  ) => Array<{
    id: string
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
  }>
}

const createServicePhaseVisibility = () =>
  servicePhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = phase.key === 'event'
    return acc
  }, {} as Record<ServicePhaseKey, boolean>)

const createServicePhaseSettings = () =>
  servicePhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = {
      selected: phase.key === 'event',
      needsResponsible: phase.key === 'event',
    }
    return acc
  }, {} as Record<ServicePhaseKey, ServicePhaseSetting>)

const buildServicePhaseEttState = (params: {
  serviceDate: string
  meetingPoint: string
  startTime: string
  endTime: string
}) =>
  servicePhaseOptions.reduce((acc, phase) => {
    acc[phase.key] = {
      open: false,
      data: {
        serviceDate: params.serviceDate,
        meetingPoint: params.meetingPoint,
        startTime: params.startTime,
        endTime: params.endTime,
        workers: '',
      },
    }
    return acc
  }, {} as Record<ServicePhaseKey, ServicePhaseEtt>)

export function useServicePhasesState({
  event,
  department,
  meetingPoint,
  location,
  startTime,
  endTime,
  totalWorkers,
  modalOpen,
}: UseServicePhasesStateOptions): UseServicePhasesStateResult {
  const defaultMeetingPoint = meetingPoint || location || event.eventLocation || ''
  const defaultServiceDate = extractDate(event.start)

  const createServiceGroup = (phaseKey: ServicePhaseKey, seed: Partial<ServeiGroup> = {}) => ({
    id: seed.id || makeGroupId(),
    phaseKey,
    serviceDate: seed.serviceDate || defaultServiceDate,
    dateLabel: seed.dateLabel || '',
    meetingPoint: seed.meetingPoint || defaultMeetingPoint,
    startTime: seed.startTime || startTime || '',
    endTime: seed.endTime || endTime || '',
    workers: seed.workers ?? 0,
    jamoneros: seed.jamoneros ?? 0,
    wantsResponsible: seed.wantsResponsible ?? phaseKey === 'event',
    responsibleId: seed.responsibleId || '',
    needsDriver: seed.needsDriver ?? false,
    driverId: seed.driverId || '',
  })

  const createServicePhaseGroups = (overrides: Partial<ServeiGroup>[] = []) =>
    servicePhaseOptions.map((phase, idx) => createServiceGroup(phase.key, overrides[idx] || {}))

  const [servicePhaseGroups, setServicePhaseGroups] = useState<ServeiGroup[]>(() => [createServiceGroup('event')])
  const [servicePhaseVisibility, setServicePhaseVisibility] = useState(createServicePhaseVisibility)
  const [servicePhaseSettings, setServicePhaseSettings] = useState(createServicePhaseSettings)
  const [servicePhaseEtt, setServicePhaseEtt] = useState<Record<ServicePhaseKey, ServicePhaseEtt>>(() =>
    buildServicePhaseEttState({
      serviceDate: defaultServiceDate,
      meetingPoint: defaultMeetingPoint,
      startTime: startTime || '',
      endTime: endTime || '',
    })
  )

  useEffect(() => {
    if (department.toLowerCase() !== 'serveis') return
    const overrides = servicePhaseOptions.map(() => ({
      serviceDate: defaultServiceDate,
      meetingPoint: defaultMeetingPoint,
      startTime: startTime || '',
      endTime: endTime || '',
      workers: totalWorkers,
    }))
    setServicePhaseGroups(createServicePhaseGroups(overrides))
    setServicePhaseVisibility(createServicePhaseVisibility())
    setServicePhaseSettings(createServicePhaseSettings())
    setServicePhaseEtt(
      buildServicePhaseEttState({
        serviceDate: defaultServiceDate,
        meetingPoint: defaultMeetingPoint,
        startTime: startTime || '',
        endTime: endTime || '',
      })
    )
  }, [department, defaultMeetingPoint, defaultServiceDate, startTime, endTime, totalWorkers, modalOpen])

  const addServiceGroup = (phaseKey: ServicePhaseKey) => {
    setServicePhaseGroups((prev) => [...prev, createServiceGroup(phaseKey)])
  }

  const updateServiceGroup = (id: string, patch: Partial<ServeiGroup>) => {
    setServicePhaseGroups((prev) => prev.map((group) => (group.id === id ? { ...group, ...patch } : group)))
  }

  const removeServiceGroup = (id: string, phaseKey: ServicePhaseKey) => {
    setServicePhaseGroups((prev) => prev.filter((group) => group.id !== id || group.phaseKey !== phaseKey))
  }

  const toggleServicePhaseSelection = (key: ServicePhaseKey) => {
    setServicePhaseSettings((prev) => ({ ...prev, [key]: { ...prev[key], selected: !prev[key].selected } }))
  }

  const updateServicePhaseSetting = (key: ServicePhaseKey, patch: Partial<ServicePhaseSetting>) => {
    setServicePhaseSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))
  }

  const toggleServicePhaseVisibility = (key: ServicePhaseKey) => {
    setServicePhaseVisibility((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleServicePhaseEtt = (key: ServicePhaseKey) => {
    setServicePhaseEtt((prev) => ({
      ...prev,
      [key]: { ...prev[key], open: !prev[key].open },
    }))
  }

  const updateServicePhaseEtt = (key: ServicePhaseKey, patch: Partial<ServicePhaseEttData>) => {
    setServicePhaseEtt((prev) => ({
      ...prev,
      [key]: { ...prev[key], data: { ...prev[key].data, ...patch } },
    }))
  }

  const activeServiceGroups = useMemo(
    () =>
      servicePhaseGroups.filter((group) => servicePhaseSettings[group.phaseKey]?.selected ?? true),
    [servicePhaseGroups, servicePhaseSettings]
  )

  const serviceTotals = useMemo(() => {
    const activeResponsiblePhases = new Set(
      activeServiceGroups
        .filter((group) => group.wantsResponsible)
        .map((group) => `${group.phaseKey}:${group.id}`)
    )
    return {
      workers: activeServiceGroups.reduce((sum, group) => sum + group.workers, 0),
      jamoneros: activeServiceGroups.reduce((sum, group) => sum + Number(group.jamoneros || 0), 0),
      drivers: activeServiceGroups.filter((group) => group.needsDriver).length,
      responsables: activeResponsiblePhases.size,
    }
  }, [activeServiceGroups, servicePhaseSettings])

  const selectedServiceGroups = useMemo(() => {
    if (activeServiceGroups.length) return activeServiceGroups
    return servicePhaseGroups[0] ? [servicePhaseGroups[0]] : []
  }, [activeServiceGroups, servicePhaseGroups])

  const buildServiceGroupsPayload = useCallback(
    (manualResponsibleId: string | null, manualResponsibleName?: string | null) => {
      return selectedServiceGroups.map((group) => {
        const wantsResponsible = group.wantsResponsible === true
        return {
          id: group.id,
          serviceDate: group.serviceDate,
          dateLabel: group.dateLabel || null,
          meetingPoint: group.meetingPoint,
          startTime: group.startTime,
          endTime: group.endTime,
          workers: group.workers,
          jamoneros: Math.max(0, Number(group.jamoneros || 0)),
          drivers: group.needsDriver ? 1 : 0,
          needsDriver: group.needsDriver,
          driverId: group.driverId || null,
          responsibleId: wantsResponsible ? group.responsibleId || manualResponsibleId : null,
          responsibleName: wantsResponsible && group.responsibleId
            ? null
            : wantsResponsible
            ? manualResponsibleName || null
            : null,
          wantsResponsible,
        }
      })
    },
    [selectedServiceGroups]
  )

  return {
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
    buildServiceGroupsPayload,
  }
}

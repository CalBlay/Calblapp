'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EditorDraftInput } from '@/lib/quadrantsDraftEditor'
import type { QuadrantEvent } from '@/types/QuadrantEvent'
import {
  ServeiGroup,
  ServiceJamoneroAssignment,
  ServicePhaseEtt,
  ServicePhaseEttData,
  ServicePhaseKey,
  ServicePhaseSetting,
  servicePhaseOptions,
} from '../phaseConfig'
import {
  createEmptyRoleLine,
  ensureGroupRoleLines,
  syncGroupFromRoleLines,
} from '../lib/serviceGroupRoleLines'
import { hydrateServiceGroupsFromDraft } from '../lib/hydrateServiceGroupsFromDraft'
import { resolveRoleLinesPersonIds } from '../lib/resolveRoleLinePersonIds'

const EMPTY_PERSONNEL_POOLS: Array<{ id: string; name: string }> = []

const extractDate = (iso = '') => iso.split('T')[0] || ''

const makeGroupId = () => `group-${Date.now()}-${Math.random().toString(16).slice(2)}`
const makeJamoneroId = () => `jamonero-${Date.now()}-${Math.random().toString(16).slice(2)}`

type UseServicePhasesStateOptions = {
  event: QuadrantEvent
  department: string
  meetingPoint: string
  location: string
  startTime: string
  endTime: string
  totalWorkers: number
  modalOpen: boolean
  existingDraft?: EditorDraftInput | null
  /** Pools de personal per resoldre ids en hidratar borradors (només nom desat). */
  personnelPools?: Array<{ id: string; name: string }>
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
  serviceJamoneroAssignments: ServiceJamoneroAssignment[]
  setServiceJamoneroCount: (count: number) => void
  updateServiceJamoneroAssignment: (id: string, patch: Partial<ServiceJamoneroAssignment>) => void
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
  existingDraft,
  personnelPools = EMPTY_PERSONNEL_POOLS,
}: UseServicePhasesStateOptions): UseServicePhasesStateResult {
  const personnelPoolIdsKey = useMemo(
    () =>
      personnelPools
        .map((p) => String(p.id || '').trim())
        .filter(Boolean)
        .sort()
        .join('|'),
    [personnelPools]
  )
  const defaultMeetingPoint = meetingPoint || location || event.eventLocation || ''
  const defaultServiceDate = extractDate(event.start)

  const normalizeLoadedGroups = useCallback((groups: ServeiGroup[]) => {
    return groups.map((group) => syncGroupFromRoleLines(group, ensureGroupRoleLines(group)))
  }, [])

  const createServiceGroup = useCallback((phaseKey: ServicePhaseKey, seed: Partial<ServeiGroup> = {}) => {
    const base: ServeiGroup = {
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
    }
    const roleLines = seed.roleLines?.length ? seed.roleLines : [createEmptyRoleLine(base, 'conductor')]
    return syncGroupFromRoleLines(base, roleLines)
  }, [defaultMeetingPoint, defaultServiceDate, endTime, startTime])

  const createServicePhaseGroups = useCallback(
    (overrides: Partial<ServeiGroup>[] = []) =>
      servicePhaseOptions.map((phase, idx) => createServiceGroup(phase.key, overrides[idx] || {})),
    [createServiceGroup]
  )

  const [servicePhaseGroups, setServicePhaseGroups] = useState<ServeiGroup[]>(() => [createServiceGroup('event')])
  const [serviceJamoneroAssignments, setServiceJamoneroAssignments] = useState<ServiceJamoneroAssignment[]>([])
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

    if (existingDraft && modalOpen) {
      const hydrated = hydrateServiceGroupsFromDraft(existingDraft, [])
      setServicePhaseGroups(normalizeLoadedGroups(hydrated.groups))
      setServiceJamoneroAssignments([])
      setServicePhaseVisibility(hydrated.visibility)
      setServicePhaseSettings(hydrated.settings)
      setServicePhaseEtt(
        buildServicePhaseEttState({
          serviceDate: existingDraft.startDate || defaultServiceDate,
          meetingPoint:
            String(existingDraft.meetingPoint || '').trim() || defaultMeetingPoint,
          startTime: existingDraft.startTime || startTime || '',
          endTime: existingDraft.endTime || endTime || '',
        })
      )
      return
    }

    const overrides = servicePhaseOptions.map(() => ({
      serviceDate: defaultServiceDate,
      meetingPoint: defaultMeetingPoint,
      startTime: startTime || '',
      endTime: endTime || '',
      workers: totalWorkers,
    }))
    setServicePhaseGroups(normalizeLoadedGroups(createServicePhaseGroups(overrides)))
    setServiceJamoneroAssignments([])
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
  }, [
    createServicePhaseGroups,
    department,
    defaultMeetingPoint,
    defaultServiceDate,
    startTime,
    endTime,
    totalWorkers,
    modalOpen,
    existingDraft,
    normalizeLoadedGroups,
  ])

  /** Quan carrega el personal, resol ids per nom sense re-hidratar tot el borrador. */
  useEffect(() => {
    if (department.toLowerCase() !== 'serveis') return
    if (!existingDraft || !modalOpen || !personnelPoolIdsKey) return

    setServicePhaseGroups((prev) => {
      let changed = false
      const next = prev.map((group) => {
        const lines = ensureGroupRoleLines(group)
        const resolved = resolveRoleLinesPersonIds(lines, personnelPools)
        const idsChanged = resolved.some(
          (line, index) => line.personId !== lines[index]?.personId
        )
        if (!idsChanged) return group
        changed = true
        return syncGroupFromRoleLines(group, resolved)
      })
      return changed ? next : prev
    })
  }, [department, existingDraft, modalOpen, personnelPoolIdsKey, personnelPools])

  const addServiceGroup = (phaseKey: ServicePhaseKey) => {
    setServicePhaseGroups((prev) => [...prev, createServiceGroup(phaseKey)])
  }

  const updateServiceGroup = (id: string, patch: Partial<ServeiGroup>) => {
    setServicePhaseGroups((prev) =>
      prev.map((group) => {
        if (group.id !== id) return group
        if (patch.roleLines) {
          return syncGroupFromRoleLines({ ...group, ...patch }, patch.roleLines)
        }
        return { ...group, ...patch }
      })
    )
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
    let workers = 0
    let jamoneros = 0
    let drivers = 0
    let responsables = 0

    activeServiceGroups.forEach((group) => {
      const lines = ensureGroupRoleLines(group).filter((line) => String(line.personId || '').trim())
      workers += lines.length
      jamoneros += lines.filter((line) => line.role === 'jamonero').length
      if (lines.some((line) => line.role === 'conductor')) drivers += 1
      if (lines.some((line) => line.role === 'responsable')) responsables += 1
    })

    return { workers, jamoneros, drivers, responsables }
  }, [activeServiceGroups])

  const setServiceJamoneroCount = useCallback((count: number) => {
    const safeCount = Math.max(0, Number.isNaN(Number(count)) ? 0 : Number(count))
    setServiceJamoneroAssignments((prev) => {
      if (safeCount === prev.length) return prev
      if (safeCount < prev.length) return prev.slice(0, safeCount)
      return [
        ...prev,
        ...Array.from({ length: safeCount - prev.length }, () => ({
          id: makeJamoneroId(),
          mode: 'auto' as const,
          personnelId: '',
        })),
      ]
    })
  }, [])

  const updateServiceJamoneroAssignment = useCallback(
    (id: string, patch: Partial<ServiceJamoneroAssignment>) => {
      setServiceJamoneroAssignments((prev) =>
        prev.map((assignment) => (assignment.id === id ? { ...assignment, ...patch } : assignment))
      )
    },
    []
  )

  const selectedServiceGroups = useMemo(() => {
    if (activeServiceGroups.length) return activeServiceGroups
    return servicePhaseGroups[0] ? [servicePhaseGroups[0]] : []
  }, [activeServiceGroups, servicePhaseGroups])

  const buildServiceGroupsPayload = useCallback(
    (manualResponsibleId: string | null, manualResponsibleName?: string | null) => {
      return selectedServiceGroups.map((group, index) => {
        const roleLines = ensureGroupRoleLines(group)
        const filledLines = roleLines.filter(
          (line) =>
            String(line.personId || '').trim() || String(line.personName || '').trim()
        )
        const responsable = filledLines.find((line) => line.role === 'responsable')
        const conductor = filledLines.find((line) => line.role === 'conductor')
        const staffLines = filledLines.filter(
          (line) => line.role === 'treballador' || line.role === 'jamonero'
        )
        const hasResponsableLine = roleLines.some((line) => line.role === 'responsable')
        const topBarResponsible =
          index === 0 &&
          group.phaseKey === 'event' &&
          Boolean(manualResponsibleId || manualResponsibleName)
        const wantsResponsible = hasResponsableLine || topBarResponsible
        const inheritsTopResponsible =
          topBarResponsible &&
          !String(responsable?.personId || responsable?.personName || '').trim()

        const manualWorkers =
          staffLines.length > 0
            ? staffLines.map((line) => ({
                id: line.personId,
                name: line.personName,
                serviceDate: line.serviceDate || group.serviceDate,
                meetingPoint: line.meetingPoint || group.meetingPoint,
                startTime: line.startTime || group.startTime,
                endTime: line.endTime || group.endTime,
                isJamonero: line.role === 'jamonero',
              }))
            : null

        return {
          id: group.id,
          serviceDate: group.serviceDate,
          dateLabel: group.dateLabel || null,
          meetingPoint: group.meetingPoint,
          startTime: group.startTime,
          endTime: group.endTime,
          workers: filledLines.length,
          jamoneros: filledLines.filter((line) => line.role === 'jamonero').length,
          drivers: conductor ? 1 : 0,
          needsDriver: roleLines.some((line) => line.role === 'conductor'),
          driverId: conductor?.personId || null,
          responsibleId: wantsResponsible
            ? responsable?.personId ||
              (inheritsTopResponsible ? manualResponsibleId : null) ||
              (conductor?.personId &&
              manualResponsibleId &&
              conductor.personId === manualResponsibleId
                ? conductor.personId
                : null)
            : null,
          responsibleName:
            wantsResponsible && responsable?.personId
              ? responsable.personName || null
              : wantsResponsible && responsable?.personName
              ? responsable.personName
              : inheritsTopResponsible
              ? manualResponsibleName || null
              : wantsResponsible &&
                conductor?.personId &&
                manualResponsibleId &&
                conductor.personId === manualResponsibleId
              ? conductor.personName || manualResponsibleName || null
              : null,
          wantsResponsible,
          ...(manualWorkers ? { manualWorkers } : {}),
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
    serviceJamoneroAssignments,
    setServiceJamoneroCount,
    updateServiceJamoneroAssignment,
    buildServiceGroupsPayload,
  }
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getCurrentMaintenanceWeekRange,
  matchesMaintenanceTicketDateFilter,
  type MaintenanceDateFilterMode,
} from '@/lib/maintenanceDateFilter'
import { useSession } from 'next-auth/react'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  isExternalMaintenanceTicketReporter,
} from '@/lib/accessControl'
import {
  getExternalReporterTicketBucket,
  getMaintenanceTicketScope,
  matchesMaintenanceTicketScope,
  matchesExternalReporterTicketBucket,
  resolveDefaultTicketCenterFromUserName,
  resolveDefaultTicketLocationFromUserName,
  type ExternalReporterTicketBucket,
} from '@/lib/maintenanceTicketCreators'
import { normalizeRole } from '@/lib/roles'
import type { Ticket, TicketPriority, TicketStatus } from './types'
import type { FiltersState } from '@/components/layout/FiltersBar'
import { useMaintenanceTicketCatalog } from './useMaintenanceTicketCatalog'
import { useMaintenanceTicketComposer } from './useMaintenanceTicketComposer'
import { normalizeName } from '@/app/menu/manteniment/preventius/planificador/utils'
import {
  canCreatorValidateMaintenanceTicket,
} from '@/lib/maintenanceTicketValidation'
import {
  MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
  MAINTENANCE_TICKETS_REOPEN_PERM,
  MAINTENANCE_TICKETS_VALIDATE_PERM,
} from '@/lib/maintenanceTicketsPermissions'
import { matchesMaintenanceSiteFilters } from '@/lib/maintenanceLocationCatalog'

type SessionUser = {
  id?: string
  name?: string
  role?: string
  department?: string
}

type ErrorWithMessage = {
  message?: string
}

type AvailabilityItem = {
  id: string
  name?: string
}

type InternalTicketBucket =
  | 'inbox'
  | 'planned'
  | 'in_progress'
  | 'waiting'
  | 'validation'
  | 'external'
  | 'closed'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

function classifyInternalTicketBucket(ticket: Ticket): InternalTicketBucket | null {
  if (ticket.externalized) return 'external'
  if (
    ticket.status === 'validat' ||
    ticket.workflowStage === 'resolved_admin' ||
    ticket.workflowStage === 'resolved_planner' ||
    ticket.workflowStage === 'closed'
  ) {
    return 'closed'
  }
  if (ticket.status === 'fet') return 'validation'
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'espera'
  ) {
    return 'waiting'
  }
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'en_curs'
  ) {
    return 'in_progress'
  }
  if (
    (
      (ticket.workflowStage || 'tickets_inbox') === 'planner_queue' ||
      ticket.workflowStage === 'planned_internal'
    ) &&
    ticket.status === 'assignat'
  ) {
    return 'planned'
  }
  if (
    (ticket.workflowStage || 'tickets_inbox') === 'tickets_inbox' &&
    (
      ticket.status === 'nou' ||
      ticket.status === 'no_fet' ||
      ticket.status === 'reassignat' ||
      ticket.status === 'assignat'
    )
  ) {
    return 'inbox'
  }
  return null
}

export function useMaintenanceTickets() {
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const role = normalizeRole(sessionUser.role || '')
  const department = normalizeDept(sessionUser.department || '')
  const userId = sessionUser.id || ''
  const { hasAction } = useUiPermissions()

  const isExternalReporter = isExternalMaintenanceTicketReporter({
    role,
    department,
  })
  const canValidate = hasAction(MAINTENANCE_TICKETS_VALIDATE_PERM)
  const canReopen = hasAction(MAINTENANCE_TICKETS_REOPEN_PERM)
  const canCapValidateTicket = useCallback(
    (_ticket: Ticket) => canValidate,
    [canValidate]
  )
  const canCreatorValidateTicket = useCallback(
    (ticket: Ticket) => canCreatorValidateMaintenanceTicket(ticket, userId),
    [userId]
  )
  const canExternalize = hasAction(MAINTENANCE_TICKETS_EXTERNALIZE_PERM)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreTickets, setHasMoreTickets] = useState(false)
  const [nextTicketsCursor, setNextTicketsCursor] = useState<number | null>(null)
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false)

  const initial: FiltersState = useMemo(() => {
    const { start, end } = getCurrentMaintenanceWeekRange()
    return {
      start,
      end,
      dateMode: 'planned',
      status: '__all__',
      priority: '__all__',
      center: '__all__',
      location: '__all__',
      zone: '__all__',
      ticketBucket: '__all__',
      ticketScope: '__all__',
    }
  }, [])

  const [filters, setFilters] = useState<FiltersState>(initial)
  const statusFilter = filters.status ?? '__all__'
  const priorityFilter = filters.priority ?? '__all__'
  const centerFilter = filters.center ?? '__all__'
  const locationFilter = filters.location ?? '__all__'
  const zoneFilter = filters.zone ?? '__all__'
  const dateModeFilter = (filters.dateMode ?? 'planned') as MaintenanceDateFilterMode
  const ticketBucketFilter = filters.ticketBucket ?? '__all__'
  const ticketScopeFilter = filters.ticketScope ?? '__all__'

  const [selected, setSelected] = useState<Ticket | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [externalizeBusy, setExternalizeBusy] = useState(false)
  const [assignDate, setAssignDate] = useState('')
  const [assignStartTime, setAssignStartTime] = useState('')
  const [assignDuration, setAssignDuration] = useState('01:00')
  const [workerCount, setWorkerCount] = useState(1)
  const [availableIds, setAvailableIds] = useState<string[]>([])
  const [availableNameNorms, setAvailableNameNorms] = useState<string[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [detailsLocation, setDetailsLocation] = useState('')
  const [detailsWorkLocation, setDetailsWorkLocation] = useState('')
  const [detailsMachine, setDetailsMachine] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsPriority, setDetailsPriority] = useState<TicketPriority>('normal')

  const { locations, centers, machines, maintenanceUsers, furgonetes } = useMaintenanceTicketCatalog()

  const defaultCreateLocation = useMemo(
    () => resolveDefaultTicketLocationFromUserName(sessionUser.name, locations) || '',
    [locations, sessionUser.name]
  )
  const defaultCreateCenter = useMemo(() => {
    const centerNames = centers.map((center) => center.name).filter(Boolean)
    return resolveDefaultTicketCenterFromUserName(sessionUser.name, centerNames) || ''
  }, [centers, sessionUser.name])
  const defaultCreateWorkerName = useMemo(() => {
    if (defaultCreateCenter) return ''
    return String(sessionUser.name || '').trim()
  }, [defaultCreateCenter, sessionUser.name])

  const fetchTickets = useCallback(
    async (opts?: { append?: boolean; cursorCreatedAt?: number }) => {
      const append = Boolean(opts?.append)
      const cursorCreatedAt = opts?.cursorCreatedAt

      try {
        if (append) {
          setLoadingMoreTickets(true)
        } else {
          setLoading(true)
          setError(null)
        }

        const params = new URLSearchParams()
        params.set('limit', '100')
        params.set('ticketType', 'maquinaria')
        if (statusFilter !== '__all__') params.set('status', statusFilter)
        if (priorityFilter !== '__all__') params.set('priority', priorityFilter)
        if (dateModeFilter === 'planned') {
          if (filters.start) params.set('start', filters.start)
          if (filters.end) params.set('end', filters.end)
          params.set('dateMode', 'planned')
        }
        if (cursorCreatedAt && cursorCreatedAt > 0) {
          params.set('cursorCreatedAt', String(cursorCreatedAt))
        }

        const res = await fetch(`/api/maintenance/tickets?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const json = await res.json()
        const nextTickets = Array.isArray(json?.tickets) ? json.tickets : []
        setTickets((prev) => (append ? [...prev, ...nextTickets] : nextTickets))
        setHasMoreTickets(Boolean(json?.hasMore))
        setNextTicketsCursor(
          typeof json?.nextCursorCreatedAt === 'number' && json.nextCursorCreatedAt > 0
            ? json.nextCursorCreatedAt
            : null
        )
      } catch {
        setError("No s'han pogut carregar els tickets.")
        if (!append) setTickets([])
        setHasMoreTickets(false)
        setNextTicketsCursor(null)
      } finally {
        if (append) {
          setLoadingMoreTickets(false)
        } else {
          setLoading(false)
        }
      }
    },
    [dateModeFilter, filters.end, filters.start, priorityFilter, statusFilter]
  )

  const {
    showCreate,
    setShowCreate,
    createCenter,
    setCreateCenter,
    centerQuery,
    setCenterQuery,
    createLocation,
    setCreateLocation,
    createZone,
    setCreateZone,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    zoneQuery,
    setZoneQuery,
    machineQuery,
    setMachineQuery,
    showCenterList,
    setShowCenterList,
    showLocationList,
    setShowLocationList,
    showZoneList,
    setShowZoneList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createWorkerName,
    setCreateWorkerName,
    needsWorkerName,
    createPriority,
    setCreatePriority,
    createAttachments,
    createAttachmentCount,
    maxTicketAttachments,
    createBusy,
    attachmentCompressing,
    attachmentError,
    formError,
    canCreateTicket,
    handleAttachmentChange,
    removeAttachment,
    handleCreateTicket,
    openCreate,
  } = useMaintenanceTicketComposer({
    refreshTickets: () => fetchTickets(),
    defaultCenter: defaultCreateCenter,
    defaultWorkerName: defaultCreateWorkerName,
    defaultLocation: defaultCreateLocation,
  })

  useEffect(() => {
    void fetchTickets()
  }, [fetchTickets])

  useEffect(() => {
    if (!selected) return
    setAssignDate('')
    setAssignStartTime('')
    setAssignDuration('01:00')
    setWorkerCount(1)
    setAvailableIds([])
    setAvailableNameNorms([])
    setShowHistory(false)
    setDetailsLocation(selected.location || '')
    setDetailsWorkLocation(selected.workLocation || '')
    setDetailsMachine(selected.machine || '')
    setDetailsDescription(selected.operatorTitle || '')
    setDetailsPriority(selected.priority || 'normal')
  }, [selected])

  useEffect(() => {
    if (!selected?.assignedToIds) return
    if (selected.assignedToIds.length <= workerCount) return

    const trimmed = selected.assignedToIds.slice(0, workerCount)
    const trimmedNames = maintenanceUsers
      .filter((user) => trimmed.includes(user.id))
      .map((user) => user.name)

    setSelected((prev) =>
      prev ? { ...prev, assignedToIds: trimmed, assignedToNames: trimmedNames } : prev
    )
  }, [maintenanceUsers, selected, workerCount])

  const computePlanning = useCallback(() => {
    if (!assignDate || !assignStartTime || !assignDuration) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }

    const start = new Date(`${assignDate}T${assignStartTime}:00`)
    if (Number.isNaN(start.getTime())) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }

    const [hoursRaw, minutesRaw] = assignDuration.trim().split(':')
    const minutes = Math.max(1, Number(hoursRaw || 0) * 60 + Number(minutesRaw || 0))
    const end = new Date(start.getTime() + minutes * 60 * 1000)

    return {
      plannedStart: start.getTime(),
      plannedEnd: end.getTime(),
      estimatedMinutes: minutes,
    }
  }, [assignDate, assignDuration, assignStartTime])

  const handleAssign = async (ticket: Ticket, assignedIds: string[], assignedNames: string[]) => {
    try {
      if ((ticket.source === 'whatsblapp' || ticket.source === 'incidencia') && ticket.status === 'nou') {
        if (!(ticket.location || detailsLocation).trim()) {
          alert("Completa la ubicacio abans d'assignar.")
          return
        }
      }

      setAssignBusy(true)
      const { plannedStart, plannedEnd, estimatedMinutes } = computePlanning()
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedToIds: assignedIds,
          assignedToNames: assignedNames,
          plannedStart,
          plannedEnd,
          estimatedMinutes,
          location:
            (ticket.source === 'whatsblapp' || ticket.source === 'incidencia') && !String(ticket.location || '').trim()
              ? detailsLocation.trim()
              : undefined,
          workLocation: detailsWorkLocation.trim() || null,
          machine:
            ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
              ? detailsMachine.trim()
              : undefined,
          operatorTitle:
            ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
              ? detailsDescription.trim()
              : undefined,
          priority:
            ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
              ? detailsPriority
              : undefined,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              assignedToIds: assignedIds,
              assignedToNames: assignedNames,
              plannedStart,
              plannedEnd,
              estimatedMinutes,
              location:
                (ticket.source === 'whatsblapp' || ticket.source === 'incidencia') && !String(prev.location || '').trim()
                  ? detailsLocation.trim()
                  : prev.location,
              workLocation: detailsWorkLocation.trim() || null,
              operatorTitle:
                ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
                  ? detailsDescription.trim()
                  : prev.operatorTitle,
            }
          : prev
      )
      setSelected(null)
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || 'Error assignant')
    } finally {
      setAssignBusy(false)
    }
  }

  const handleCreatorValidate = async (ticket: Ticket) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validationApproval: 'creator' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) =>
        prev && prev.id === ticket.id
          ? {
              ...prev,
              creatorValidatedAt: Date.now(),
              status: prev.capValidatedAt ? 'validat' : 'fet',
            }
          : prev
      )
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut validar")
    }
  }

  const handleStatusChange = async (
    ticket: Ticket,
    status: TicketStatus,
    meta?: {
      supplierResolvedAt?: number | null
      note?: string | null
      validationApproval?: 'cap'
      completionImages?: Array<{
        url?: string | null
        path?: string | null
        meta?: { size?: number; type?: string; name?: string } | null
      }>
    }
  ) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          supplierResolvedAt: meta?.supplierResolvedAt,
          statusNote: meta?.note,
          validationApproval: meta?.validationApproval,
          completionImages: meta?.completionImages,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              status,
              supplierResolvedAt:
                meta?.supplierResolvedAt !== undefined
                  ? meta.supplierResolvedAt
                  : prev.supplierResolvedAt,
            }
          : prev
      )
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut actualitzar")
    }
  }

  const handleReopen = async (ticket: Ticket) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fet' }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) => (prev ? { ...prev, status: 'fet' } : prev))
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut reobrir")
    }
  }

  const handleAssignVehicle = async (
    ticket: Ticket,
    needsVehicle: boolean,
    vehicleType: string | null,
    plate: string | null
  ) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needsVehicle,
          vehicleType: needsVehicle ? vehicleType : null,
          vehiclePlate: needsVehicle ? plate : null,
          vehicleId: null,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              needsVehicle,
              vehicleType: needsVehicle ? vehicleType : null,
              vehiclePlate: needsVehicle ? plate : null,
            }
          : prev
      )
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut guardar")
    }
  }

  const handleUpdateDetails = async () => {
    if (!selected) return
    try {
      const res = await fetch(`/api/maintenance/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: !String(selected.location || '').trim() ? detailsLocation.trim() : undefined,
          workLocation: detailsWorkLocation.trim() || null,
          machine: detailsMachine.trim(),
          operatorTitle: detailsDescription.trim(),
          priority: detailsPriority,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              location: !String(prev.location || '').trim() ? detailsLocation.trim() : prev.location,
              workLocation: detailsWorkLocation.trim() || null,
              machine: detailsMachine.trim(),
              operatorTitle: detailsDescription.trim(),
              priority: detailsPriority,
            }
          : prev
      )
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'han pogut desar els canvis")
    }
  }

  const handleExternalize = async (
    ticket: Ticket,
    payload: {
      supplierName: string
      supplierEmail: string
      subject: string
      message: string
      externalReference?: string | null
      attachments?: Array<{
        name: string
        path: string
        contentType?: string | null
      }>
    }
  ) => {
    try {
      setExternalizeBusy(true)
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}/externalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)

      await fetchTickets()
      if (json?.ticket) setSelected(json.ticket)
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || 'No s ha pogut enviar al proveidor')
    } finally {
      setExternalizeBusy(false)
    }
  }

  const loadAvailability = useCallback(async () => {
    const { plannedStart, plannedEnd } = computePlanning()
    if (!plannedStart || !plannedEnd) {
      setAvailableIds([])
      setAvailableNameNorms([])
      return
    }

    const startDate = new Date(plannedStart)
    const endDate = new Date(plannedEnd)
    const sd = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(
      startDate.getDate()
    ).padStart(2, '0')}`
    const ed = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(
      endDate.getDate()
    ).padStart(2, '0')}`
    const st = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`
    const et = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`

    try {
      setAvailabilityLoading(true)
      const params = new URLSearchParams({
        department: 'manteniment',
        startDate: sd,
        endDate: ed,
        startTime: st,
        endTime: et,
      })
      if (selected?.id) params.set('excludeMaintenanceTicketId', String(selected.id))
      const res = await fetch(`/api/personnel/available?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        setAvailableIds([])
        setAvailableNameNorms([])
        return
      }
      const json = await res.json()
      const list: AvailabilityItem[] = Array.isArray(json?.treballadors) ? json.treballadors : []
      setAvailableIds(list.map((person) => String(person.id || '')).filter(Boolean))
      setAvailableNameNorms(
        list.map((person) => normalizeName(String(person.name || ''))).filter(Boolean)
      )
    } finally {
      setAvailabilityLoading(false)
    }
  }, [computePlanning, selected?.id])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAvailability()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [loadAvailability])

  const handleDelete = async (ticket: Ticket) => {
    if (!confirm('Eliminar el ticket?')) return
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(String(json?.error || `HTTP ${res.status}`))
      }
      await fetchTickets()
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut eliminar")
    }
  }

  const handleSendToPlanner = async (ticket: Ticket) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowStage: 'planner_queue',
          statusNote: 'Derivat al planificador des del modul de tickets',
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) => (prev ? { ...prev, workflowStage: 'planner_queue' } : prev))
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || 'No s ha pogut enviar al planificador')
    }
  }

  const handleDirectResolution = async (
    ticket: Ticket,
    payload: {
      area: 'administracio' | 'manteniment'
      category: string
      note: string
      completionImages?: Array<{
        url?: string | null
        path?: string | null
        meta?: { size?: number; type?: string; name?: string } | null
      }>
    }
  ) => {
    try {
      const workflowStage = payload.area === 'administracio' ? 'resolved_admin' : 'resolved_planner'
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowStage,
          resolvedByArea: payload.area,
          resolutionCategory: payload.category.trim() || null,
          resolutionNote: payload.note.trim() || null,
          statusNote: payload.note.trim() || `Resolt per ${payload.area}`,
          completionImages: payload.completionImages,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              workflowStage,
              resolvedByArea: payload.area,
              resolutionCategory: payload.category.trim() || null,
              resolutionNote: payload.note.trim() || null,
              status: 'fet',
            }
          : prev
      )
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || 'No s ha pogut resoldre el ticket')
    }
  }

  const groupedTickets = useMemo(() => {
    const inRange = tickets
      .filter((ticket) =>
        matchesMaintenanceTicketDateFilter({
          mode: dateModeFilter,
          start: filters.start,
          end: filters.end,
          plannedStart: ticket.plannedStart,
          createdAt: ticket.createdAt,
        })
      )
      .filter((ticket) =>
        isExternalReporter
          ? matchesExternalReporterTicketBucket(ticket, ticketBucketFilter)
          : matchesMaintenanceTicketScope(ticket, ticketScopeFilter)
      )
      .filter((ticket) =>
        matchesMaintenanceSiteFilters(
          centers,
          {
            center: centerFilter !== '__all__' ? centerFilter : '',
            location: locationFilter !== '__all__' ? locationFilter : '',
            zone: zoneFilter !== '__all__' ? zoneFilter : '',
          },
          ticket.workLocation,
          ticket.location
        )
      )

    const internalScoped = inRange.filter(
      (ticket) => !ticket.externalized && matchesMaintenanceTicketScope(ticket, ticketScopeFilter)
    )

    const sortTickets = (list: Ticket[]) =>
      [...list].sort((a, b) => {
        const toDateValue = (value?: string | number | null) => {
          if (typeof value === 'string') {
            const parsed = new Date(value).getTime()
            return Number.isNaN(parsed) ? 0 : parsed
          }
          return Number(value || 0)
        }
        const getDayKey = (value?: string | number | null) => {
          const date = new Date(toDateValue(value))
          if (Number.isNaN(date.getTime())) return ''
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        }
        const priorityWeight = { urgent: 0, alta: 1, normal: 2, baixa: 3 }
        const ta = toDateValue(a.createdAt)
        const tb = toDateValue(b.createdAt)
        const dayA = getDayKey(a.createdAt)
        const dayB = getDayKey(b.createdAt)
        if (dayA === dayB) {
          const pa = priorityWeight[a.priority]
          const pb = priorityWeight[b.priority]
          if (pa !== pb) return pa - pb
        }
        return tb - ta
      })

    if (isExternalReporter) {
      const bucketSections: Array<{
        key: ExternalReporterTicketBucket
        title: string
        note: string
      }> = [
        { key: 'nou', title: 'Nous', note: 'Pendents de gestio per manteniment' },
        { key: 'assignat', title: 'Assignats', note: 'Amb operari i data prevista' },
        { key: 'fet', title: 'Fets', note: 'Feina completada o tancada' },
        { key: 'externalitzat', title: 'Externalitzats', note: 'Derivats a proveidor' },
      ]

      const sections = bucketSections.map((section) => ({
        ...section,
        items: sortTickets(
          inRange.filter((ticket) => getExternalReporterTicketBucket(ticket) === section.key)
        ),
      }))

      return sections.filter((section) => section.items.length > 0)
    }

    const ticketsInbox = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'inbox')
    const plannedTickets = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'planned')
    const inProgressTickets = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'in_progress')
    const waitingTickets = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'waiting')
    const pendingValidationTickets = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'validation')
    const closedTickets = internalScoped.filter((ticket) => classifyInternalTicketBucket(ticket) === 'closed')
    const externalizedTickets = inRange.filter((ticket) => ticket.externalized)

    const sections: Array<{
      key: InternalTicketBucket
      title: string
      note: string
      items: Ticket[]
    }> = [
      {
        key: 'inbox',
        title: 'Nous i per decidir',
        note: 'Entrades noves o reobertes pendents d enfocar',
        items: ticketsInbox,
      },
      {
        key: 'planned',
        title: 'Planificats',
        note: 'Tickets assignats o derivats, pendents de començar',
        items: plannedTickets,
      },
      {
        key: 'in_progress',
        title: 'En curs',
        note: 'Feines que s estan executant ara mateix',
        items: inProgressTickets,
      },
      {
        key: 'waiting',
        title: 'En espera',
        note: 'Feines bloquejades o pendents d una accio externa',
        items: waitingTickets,
      },
      {
        key: 'validation',
        title: 'Pendents de validar',
        note: 'Tickets fets pendents de revisio final',
        items: pendingValidationTickets,
      },
      {
        key: 'external',
        title: 'Externalitzats',
        note: 'Tickets derivats a proveidor',
        items: externalizedTickets,
      },
      {
        key: 'closed',
        title: 'Validats',
        note: 'Feines tancades i validades',
        items: closedTickets,
      },
    ]

    const filteredSections =
      ticketBucketFilter !== '__all__'
        ? sections.filter((section) => section.key === ticketBucketFilter)
        : sections

    return filteredSections
      .map((section) => ({ ...section, items: sortTickets(section.items) }))
      .filter((section) => section.items.length > 0)
  }, [
    centerFilter,
    centers,
    dateModeFilter,
    filters.end,
    filters.start,
    isExternalReporter,
    locationFilter,
    ticketBucketFilter,
    ticketScopeFilter,
    tickets,
    zoneFilter,
  ])

  const externalReporterSummary = useMemo(() => {
    const inRange = (ticket: Ticket) =>
      matchesMaintenanceTicketDateFilter({
        mode: dateModeFilter,
        start: filters.start,
        end: filters.end,
        plannedStart: ticket.plannedStart,
        createdAt: ticket.createdAt,
      })

    const countBucket = (bucket: ExternalReporterTicketBucket) =>
      tickets.filter(
        (ticket) =>
          inRange(ticket) &&
          matchesMaintenanceSiteFilters(
            centers,
            {
              center: centerFilter !== '__all__' ? centerFilter : '',
              location: locationFilter !== '__all__' ? locationFilter : '',
              zone: zoneFilter !== '__all__' ? zoneFilter : '',
            },
            ticket.workLocation,
            ticket.location
          ) &&
          getExternalReporterTicketBucket(ticket) === bucket
      ).length

    return {
      nou: countBucket('nou'),
      assignat: countBucket('assignat'),
      fet: countBucket('fet'),
      externalitzat: countBucket('externalitzat'),
    }
  }, [centerFilter, centers, dateModeFilter, filters.end, filters.start, locationFilter, tickets, zoneFilter])

  const ticketSummary = useMemo(() => {
    const inRange = (ticket: Ticket) =>
      matchesMaintenanceTicketDateFilter({
        mode: dateModeFilter,
        start: filters.start,
        end: filters.end,
        plannedStart: ticket.plannedStart,
        createdAt: ticket.createdAt,
      })

    const scopedInternalTickets = tickets.filter(
      (ticket) =>
        inRange(ticket) &&
        matchesMaintenanceSiteFilters(
          centers,
          {
            center: centerFilter !== '__all__' ? centerFilter : '',
            location: locationFilter !== '__all__' ? locationFilter : '',
            zone: zoneFilter !== '__all__' ? zoneFilter : '',
          },
          ticket.workLocation,
          ticket.location
        ) &&
        matchesMaintenanceTicketScope(ticket, ticketScopeFilter) &&
        !ticket.externalized
    )

    return {
      inbox: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'inbox').length,
      planned: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'planned').length,
      inProgress: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'in_progress').length,
      waiting: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'waiting').length,
      pendingValidation: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'validation').length,
      externalized: tickets.filter(
        (ticket) =>
          inRange(ticket) &&
          matchesMaintenanceSiteFilters(
            centers,
            {
              center: centerFilter !== '__all__' ? centerFilter : '',
              location: locationFilter !== '__all__' ? locationFilter : '',
              zone: zoneFilter !== '__all__' ? zoneFilter : '',
            },
            ticket.workLocation,
            ticket.location
          ) &&
          matchesMaintenanceTicketScope(ticket, ticketScopeFilter) &&
          ticket.externalized
      ).length,
      closed: scopedInternalTickets.filter((ticket) => classifyInternalTicketBucket(ticket) === 'closed').length,
    }
  }, [
    centerFilter,
    centers,
    dateModeFilter,
    filters.end,
    filters.start,
    locationFilter,
    ticketScopeFilter,
    tickets,
    zoneFilter,
  ])

  const ticketScopeSummary = useMemo(() => {
    const counts: Record<'restaurants' | 'cuina_central' | 'centres_propis', number> = {
      restaurants: 0,
      cuina_central: 0,
      centres_propis: 0,
    }

    tickets.forEach((ticket) => {
      const inCurrentDateRange = matchesMaintenanceTicketDateFilter({
        mode: dateModeFilter,
        start: filters.start,
        end: filters.end,
        plannedStart: ticket.plannedStart,
        createdAt: ticket.createdAt,
      })
      if (!inCurrentDateRange) return
      if (
        !matchesMaintenanceSiteFilters(
          centers,
          {
            center: centerFilter !== '__all__' ? centerFilter : '',
            location: locationFilter !== '__all__' ? locationFilter : '',
            zone: zoneFilter !== '__all__' ? zoneFilter : '',
          },
          ticket.workLocation,
          ticket.location
        )
      ) {
        return
      }

      if (!classifyInternalTicketBucket(ticket) && !ticket.externalized) return
      counts[getMaintenanceTicketScope(ticket)] += 1
    })

    return counts
  }, [
    centerFilter,
    centers,
    dateModeFilter,
    filters.end,
    filters.start,
    locationFilter,
    tickets,
    zoneFilter,
  ])

  return {
    role,
    department,
    userId,
    isExternalReporter,
    canValidate,
    canCapValidateTicket,
    canCreatorValidateTicket,
    canReopen,
    canExternalize,
    tickets,
    loading,
    error,
    hasMoreTickets,
    nextTicketsCursor,
    loadingMoreTickets,
    filters,
    setFilters,
    locations,
    centers,
    machines,
    showCreate,
    setShowCreate,
    openCreate,
    createCenter,
    setCreateCenter,
    centerQuery,
    setCenterQuery,
    createLocation,
    setCreateLocation,
    createZone,
    setCreateZone,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    zoneQuery,
    setZoneQuery,
    machineQuery,
    setMachineQuery,
    showCenterList,
    setShowCenterList,
    showLocationList,
    setShowLocationList,
    showZoneList,
    setShowZoneList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createWorkerName,
    setCreateWorkerName,
    needsWorkerName,
    createPriority,
    setCreatePriority,
    createAttachmentCount,
    maxTicketAttachments,
    createBusy,
    attachmentCompressing,
    attachmentError,
    formError,
    canCreateTicket,
    selected,
    setSelected,
    assignBusy,
    externalizeBusy,
    assignDate,
    setAssignDate,
    assignStartTime,
    setAssignStartTime,
    assignDuration,
    setAssignDuration,
    workerCount,
    setWorkerCount,
    availableIds,
    availableNameNorms,
    availabilityLoading,
    showHistory,
    setShowHistory,
    detailsLocation,
    setDetailsLocation,
    detailsWorkLocation,
    setDetailsWorkLocation,
    detailsMachine,
    setDetailsMachine,
    detailsDescription,
    setDetailsDescription,
    detailsPriority,
    setDetailsPriority,
    maintenanceUsers,
    furgonetes,
    createAttachmentPreviews: createAttachments.map((item) => ({
      preview: item.preview,
      kind: item.kind,
    })),
    handleAttachmentChange,
    removeAttachment,
    createImageCount: createAttachmentCount,
    maxTicketImages: maxTicketAttachments,
    imageError: attachmentError,
    createImagePreviews: createAttachments.map((item) => item.preview),
    handleImageChange: handleAttachmentChange,
    removeImage: removeAttachment,
    handleCreateTicket,
    handleAssign,
    handleStatusChange,
    handleReopen,
    handleAssignVehicle,
    handleUpdateDetails,
    handleExternalize,
    handleSendToPlanner,
    handleDirectResolution,
    handleCreatorValidate,
    handleDelete,
    fetchMoreTickets: () =>
      nextTicketsCursor
        ? fetchTickets({ append: true, cursorCreatedAt: nextTicketsCursor })
        : Promise.resolve(),
    groupedTickets,
    ticketSummary,
    externalReporterSummary,
    ticketScopeSummary,
  }
}

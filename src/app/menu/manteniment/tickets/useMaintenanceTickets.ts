import { useCallback, useEffect, useMemo, useState } from 'react'
import { endOfWeek, format, parseISO, startOfWeek } from 'date-fns'
import { useSession } from 'next-auth/react'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import type { Ticket, TicketPriority, TicketStatus } from './types'
import type { FiltersState } from '@/components/layout/FiltersBar'
import { useMaintenanceTicketCatalog } from './useMaintenanceTicketCatalog'
import { useMaintenanceTicketComposer } from './useMaintenanceTicketComposer'

type SessionUser = {
  id?: string
  role?: string
  department?: string
}

type ErrorWithMessage = {
  message?: string
}

type AvailabilityItem = {
  id: string
}

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function useMaintenanceTickets() {
  const { data: session } = useSession()
  const sessionUser = (session?.user || {}) as SessionUser
  const role = normalizeRole(sessionUser.role || '')
  const department = normalizeDept(sessionUser.department || '')
  const userId = sessionUser.id || ''

  const isMaintenanceCap = role === 'cap' && isMaintenanceCapDepartment(department)
  const canValidate = role === 'admin' || isMaintenanceCap
  const canReopen = canValidate
  const canExternalize =
    role === 'admin' ||
    role === 'direccio' ||
    (role === 'cap' && isMaintenanceCapDepartment(department))

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreTickets, setHasMoreTickets] = useState(false)
  const [nextTicketsCursor, setNextTicketsCursor] = useState<number | null>(null)
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false)

  const initial: FiltersState = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    const end = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      dateMode: 'all',
      status: '__all__',
      priority: '__all__',
      location: '__all__',
    }
  }, [])

  const [filters, setFilters] = useState<FiltersState>(initial)
  const statusFilter = filters.status ?? '__all__'
  const priorityFilter = filters.priority ?? '__all__'
  const locationFilter = filters.location ?? '__all__'
  const dateModeFilter = filters.dateMode ?? 'all'

  const [selected, setSelected] = useState<Ticket | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [externalizeBusy, setExternalizeBusy] = useState(false)
  const [assignDate, setAssignDate] = useState('')
  const [assignStartTime, setAssignStartTime] = useState('')
  const [assignDuration, setAssignDuration] = useState('01:00')
  const [workerCount, setWorkerCount] = useState(1)
  const [availableIds, setAvailableIds] = useState<string[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [detailsLocation, setDetailsLocation] = useState('')
  const [detailsWorkLocation, setDetailsWorkLocation] = useState('')
  const [detailsMachine, setDetailsMachine] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsPriority, setDetailsPriority] = useState<TicketPriority>('normal')

  const { locations, machines, maintenanceUsers, furgonetes } = useMaintenanceTicketCatalog()

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
        if (locationFilter !== '__all__') params.set('location', locationFilter)
        if (filters.start) params.set('start', filters.start)
        if (filters.end) params.set('end', filters.end)
        if (dateModeFilter !== 'all') params.set('dateMode', dateModeFilter)
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
    [dateModeFilter, filters.end, filters.start, locationFilter, priorityFilter, statusFilter]
  )

  const {
    showCreate,
    setShowCreate,
    createLocation,
    setCreateLocation,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    machineQuery,
    setMachineQuery,
    showLocationList,
    setShowLocationList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createPriority,
    setCreatePriority,
    createImagePreview,
    createBusy,
    imageError,
    handleImageChange,
    handleCreateTicket,
  } = useMaintenanceTicketComposer({
    refreshTickets: () => fetchTickets(),
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

  const handleStatusChange = async (
    ticket: Ticket,
    status: TicketStatus,
    meta?: { supplierResolvedAt?: number | null; note?: string | null }
  ) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          supplierResolvedAt: meta?.supplierResolvedAt,
          statusNote: meta?.note,
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
      const res = await fetch(
        `/api/personnel/available?department=manteniment&startDate=${sd}&endDate=${ed}&startTime=${st}&endTime=${et}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        setAvailableIds([])
        return
      }
      const json = await res.json()
      const list: AvailabilityItem[] = Array.isArray(json?.treballadors) ? json.treballadors : []
      setAvailableIds(list.map((person) => person.id))
    } finally {
      setAvailabilityLoading(false)
    }
  }, [computePlanning])

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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
    } catch (err: unknown) {
      const error = err as ErrorWithMessage
      alert(error?.message || "No s'ha pogut eliminar")
    }
  }

  const groupedTickets = useMemo(() => {
    const start = parseISO(filters.start)
    const end = new Date(parseISO(filters.end).getTime() + 24 * 60 * 60 * 1000)
    const getFilterDate = (ticket: Ticket) => {
      if (dateModeFilter === 'planned') return ticket.plannedStart || null
      if (dateModeFilter === 'created') return ticket.createdAt || null
      if (dateModeFilter === 'updated') {
        const latest = (ticket.statusHistory || [])
          .slice()
          .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at
        return latest || ticket.assignedAt || ticket.createdAt || null
      }
      if (dateModeFilter === 'completed') {
        return (ticket.statusHistory || [])
          .filter((entry) => entry.status === 'validat' || entry.status === 'resolut')
          .sort((a, b) => Number(b.at || 0) - Number(a.at || 0))[0]?.at || null
      }
      return ticket.plannedStart || ticket.assignedAt || ticket.createdAt || null
    }
    const inRange = tickets.filter((ticket) => {
      if (dateModeFilter === 'all') return true
      const base = getFilterDate(ticket)
      const date = typeof base === 'string' ? new Date(base) : new Date(Number(base))
      if (Number.isNaN(date.getTime())) return false
      return date >= start && date <= end
    })

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

    const sections = [
      {
        key: 'inbox',
        title: 'Nous i per decidir',
        note: 'Entrades noves o reobertes pendents d enfocar',
        items: inRange.filter((ticket) => !ticket.externalized && (ticket.status === 'nou' || ticket.status === 'no_fet')),
      },
      {
        key: 'planned',
        title: 'Planificats',
        note: 'Feines assignades amb franja o a punt de passar a execucio',
        items: inRange.filter((ticket) => !ticket.externalized && ticket.status === 'assignat'),
      },
      {
        key: 'active',
        title: 'En curs i en espera',
        note: 'Feines obertes que ja s estan executant o bloquejades',
        items: inRange.filter((ticket) => !ticket.externalized && (ticket.status === 'en_curs' || ticket.status === 'espera')),
      },
      {
        key: 'validation',
        title: 'Pendents de validar',
        note: 'Tickets resolts per operari o proveidor pendents de revisio final',
        items: inRange.filter((ticket) => !ticket.externalized && ticket.status === 'fet'),
      },
      {
        key: 'external',
        title: 'Externalitzats',
        note: 'Tickets derivats a proveidor',
        items: inRange.filter((ticket) => ticket.externalized),
      },
      {
        key: 'closed',
        title: 'Validats',
        note: 'Feines tancades i validades',
        items: inRange.filter((ticket) => ticket.status === 'validat' || ticket.status === 'resolut'),
      },
    ]

    return sections
      .map((section) => ({ ...section, items: sortTickets(section.items) }))
      .filter((section) => section.items.length > 0)
  }, [dateModeFilter, filters.end, filters.start, tickets])

  const ticketSummary = useMemo(
    () => ({
      inbox: tickets.filter((ticket) => !ticket.externalized && (ticket.status === 'nou' || ticket.status === 'no_fet')).length,
      planned: tickets.filter((ticket) => !ticket.externalized && ticket.status === 'assignat').length,
      active: tickets.filter((ticket) => !ticket.externalized && (ticket.status === 'en_curs' || ticket.status === 'espera')).length,
      pendingValidation: tickets.filter((ticket) => !ticket.externalized && ticket.status === 'fet').length,
      externalized: tickets.filter((ticket) => ticket.externalized).length,
    }),
    [tickets]
  )

  return {
    role,
    department,
    userId,
    canValidate,
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
    machines,
    showCreate,
    setShowCreate,
    createLocation,
    setCreateLocation,
    createMachine,
    setCreateMachine,
    locationQuery,
    setLocationQuery,
    machineQuery,
    setMachineQuery,
    showLocationList,
    setShowLocationList,
    showMachineList,
    setShowMachineList,
    createDescription,
    setCreateDescription,
    createPriority,
    setCreatePriority,
    createImagePreview,
    createBusy,
    imageError,
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
    handleImageChange,
    handleCreateTicket,
    handleAssign,
    handleStatusChange,
    handleReopen,
    handleAssignVehicle,
    handleUpdateDetails,
    handleExternalize,
    handleDelete,
    fetchMoreTickets: () =>
      nextTicketsCursor
        ? fetchTickets({ append: true, cursorCreatedAt: nextTicketsCursor })
        : Promise.resolve(),
    groupedTickets,
    ticketSummary,
  }
}

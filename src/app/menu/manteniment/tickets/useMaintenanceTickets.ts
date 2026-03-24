import { useEffect, useMemo, useState } from 'react'
import { startOfWeek, endOfWeek, format, parseISO } from 'date-fns'
import { useSession } from 'next-auth/react'
import { useTransports } from '@/hooks/useTransports'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import type {
  MachineItem,
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketType,
  TransportItem,
  UserItem,
} from './types'
import type { FiltersState } from '@/components/layout/FiltersBar'

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export function useMaintenanceTickets(options?: { ticketType?: TicketType }) {
  const { data: session } = useSession()
  const role = normalizeRole((session?.user as any)?.role || '')
  const department = normalizeDept((session?.user as any)?.department || '')
  const userId = (session?.user as any)?.id || ''

  const isMaintenanceCap = role === 'cap' && isMaintenanceCapDepartment(department)
  const canValidate = role === 'admin' || isMaintenanceCap
  const canReopen = canValidate
  const canExternalize =
    role === 'admin' ||
    role === 'direccio' ||
    (role === 'cap' &&
      (isMaintenanceCapDepartment(department) ||
        department === 'decoracio' ||
        department === 'decoracions' ||
        department === 'decoracion'))

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreTickets, setHasMoreTickets] = useState(false)
  const [nextTicketsCursor, setNextTicketsCursor] = useState<number | null>(null)
  const [loadingMoreTickets, setLoadingMoreTickets] = useState(false)

  const initial: FiltersState = useMemo(() => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 })
    const e = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      start: format(s, 'yyyy-MM-dd'),
      end: format(e, 'yyyy-MM-dd'),
      status: '__all__',
      priority: '__all__',
      location: '__all__',
    }
  }, [])

  const [filters, setFilters] = useState<FiltersState>(initial)

  const statusFilter = filters.status ?? '__all__'
  const priorityFilter = filters.priority ?? '__all__'
  const locationFilter = filters.location ?? '__all__'
  const ticketTypeFilter = options?.ticketType || 'maquinaria'

  const [locations, setLocations] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineItem[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [createLocation, setCreateLocation] = useState('')
  const [createMachine, setCreateMachine] = useState('')
  const [locationQuery, setLocationQuery] = useState('')
  const [machineQuery, setMachineQuery] = useState('')
  const [showLocationList, setShowLocationList] = useState(false)
  const [showMachineList, setShowMachineList] = useState(false)
  const [createDescription, setCreateDescription] = useState('')
  const [createPriority, setCreatePriority] = useState<TicketPriority>('normal')
  const [createTicketType, setCreateTicketType] = useState<TicketType>(ticketTypeFilter)
  const [createImageFile, setCreateImageFile] = useState<File | null>(null)
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)

  const [selected, setSelected] = useState<Ticket | null>(null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [externalizeBusy, setExternalizeBusy] = useState(false)
  const [assignDate, setAssignDate] = useState('')
  const [assignStartTime, setAssignStartTime] = useState('')
  const [assignDuration, setAssignDuration] = useState('01:00')
  const [workerCount, setWorkerCount] = useState(1)
  const [availableIds, setAvailableIds] = useState<string[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [detailsLocation, setDetailsLocation] = useState('')
  const [detailsMachine, setDetailsMachine] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsPriority, setDetailsPriority] = useState<TicketPriority>('normal')

  const [users, setUsers] = useState<UserItem[]>([])

  const { data: transports } = useTransports()

  const targetDept = ticketTypeFilter === 'deco' ? 'decoracio' : 'manteniment'
  const maintenanceUsers = useMemo(
    () =>
      users.filter((u) => {
        const dept = normalizeDept(u.departmentLower || u.department)
        const role = normalizeRole(u.role || '')
        const isAssignable = role === 'treballador' || role === 'cap'
        if (!isAssignable) return false
        if (ticketTypeFilter === 'deco') {
          return dept === 'decoracio' || dept === 'decoracions' || dept === 'decoracion'
        }
        return dept === 'manteniment'
      }),
    [users, ticketTypeFilter]
  )

  const furgonetes = useMemo(
    () =>
      (transports as TransportItem[]).filter((t) => t.type === 'furgonetaManteniment'),
    [transports]
  )

  const fetchTickets = async (opts?: { append?: boolean; cursorCreatedAt?: number }) => {
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
      if (statusFilter !== '__all__') params.set('status', statusFilter)
      if (priorityFilter !== '__all__') params.set('priority', priorityFilter)
      if (ticketTypeFilter) params.set('ticketType', ticketTypeFilter)
      if (locationFilter && locationFilter !== '__all__') {
        params.set('location', locationFilter)
      }
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
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
    } catch (err: any) {
      void err
      setError('No s’han pogut carregar els tickets.')
      if (!append) {
        setTickets([])
      }
      setHasMoreTickets(false)
      setNextTicketsCursor(null)
    } finally {
      if (append) {
        setLoadingMoreTickets(false)
      } else {
        setLoading(false)
      }
    }
  }

  const fetchLocations = async () => {
    try {
      const res = await fetch('/api/spaces/internal', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setLocations(Array.isArray(json?.locations) ? json.locations : [])
    } catch {
      setLocations([])
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/personnel?department=${encodeURIComponent(targetDept)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return
      const json = await res.json()
      setUsers(Array.isArray(json?.data) ? json.data : [])
    } catch {
      setUsers([])
    }
  }

  const fetchMachines = async () => {
    if (ticketTypeFilter === 'deco') {
      setMachines([])
      return
    }
    try {
      const res = await fetch('/api/maintenance/machines', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setMachines(Array.isArray(json?.machines) ? json.machines : [])
    } catch {
      setMachines([])
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [statusFilter, priorityFilter, locationFilter, ticketTypeFilter, filters.start, filters.end])

  useEffect(() => {
    fetchLocations()
    fetchUsers()
    fetchMachines()
  }, [targetDept, ticketTypeFilter])

  useEffect(() => {
    setLocationQuery(createLocation)
  }, [createLocation])

  useEffect(() => {
    setMachineQuery(createMachine)
  }, [createMachine])

  useEffect(() => {
    if (!selected) return
    setAssignDate('')
    setAssignStartTime('')
    setAssignDuration('01:00')
    setWorkerCount(1)
    setAvailableIds([])
    setShowHistory(false)
    setDetailsLocation(selected.location || '')
    setDetailsMachine(selected.machine || '')
    setDetailsDescription(selected.description || '')
    setDetailsPriority(selected.priority || 'normal')
  }, [selected?.id])

  useEffect(() => {
    if (!selected) return
    if (!selected.assignedToIds) return
    if (selected.assignedToIds.length <= workerCount) return
    const trimmed = selected.assignedToIds.slice(0, workerCount)
    const trimmedNames = maintenanceUsers
      .filter((u) => trimmed.includes(u.id))
      .map((u) => u.name)
    setSelected((prev) =>
      prev ? { ...prev, assignedToIds: trimmed, assignedToNames: trimmedNames } : prev
    )
  }, [workerCount])

  const handleImageChange = (file: File | null) => {
    if (!file) {
      setCreateImageFile(null)
      setCreateImagePreview(null)
      setImageError(null)
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setCreateImageFile(null)
      setCreateImagePreview(null)
      setImageError('La imatge supera 2MB. Fes-la més petita.')
      return
    }
    setImageError(null)
    setCreateImageFile(file)
    setCreateImagePreview(URL.createObjectURL(file))
  }

  const uploadImageIfNeeded = async () => {
    if (!createImageFile) return { url: null, path: null, meta: null }
    const form = new FormData()
    form.append('file', createImageFile)
    const res = await fetch('/api/maintenance/upload-image', {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      throw new Error(json?.error || 'No s’ha pogut pujar la imatge')
    }
    const json = await res.json()
    return { url: json.url || null, path: json.path || null, meta: json.meta || null }
  }

  const handleCreateTicket = async () => {
    if (!createLocation || !createMachine || !createDescription) return
    try {
      setCreateBusy(true)
      const image = await uploadImageIfNeeded()
      const res = await fetch('/api/maintenance/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: createLocation,
          machine: createMachine,
          description: createDescription,
          priority: createPriority,
          ticketType: createTicketType,
          source: 'manual',
          imageUrl: image.url,
          imagePath: image.path,
          imageMeta: image.meta,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setShowCreate(false)
      setCreateLocation('')
      setCreateMachine('')
      setCreateDescription('')
      setCreatePriority('normal')
      setCreateTicketType(ticketTypeFilter)
      setCreateImageFile(null)
      setCreateImagePreview(null)
      await fetchTickets()
    } catch (err: any) {
      alert(err?.message || 'Error creant ticket')
    } finally {
      setCreateBusy(false)
    }
  }

  const computePlanning = () => {
    if (!assignDate || !assignStartTime || !assignDuration) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }
    const start = new Date(`${assignDate}T${assignStartTime}:00`)
    if (Number.isNaN(start.getTime())) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }
    const parsed = assignDuration.trim()
    const parts = parsed.split(':')
    const hours = Number(parts[0] || 0)
    const mins = Number(parts[1] || 0)
    const minutes = Math.max(1, hours * 60 + mins)
    const end = new Date(start.getTime() + minutes * 60 * 1000)
    return { plannedStart: start.getTime(), plannedEnd: end.getTime(), estimatedMinutes: minutes }
  }

  const handleAssign = async (ticket: Ticket, assignedIds: string[], assignedNames: string[]) => {
    try {
    if ((ticket.source === 'whatsblapp' || ticket.source === 'incidencia') && ticket.status === 'nou') {
      if (!detailsLocation.trim() || !detailsDescription.trim()) {
        alert('Completa ubicació i observacions abans d’assignar.')
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
            ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
              ? detailsLocation.trim()
              : undefined,
          machine:
            ticket.source === 'whatsblapp' || ticket.source === 'incidencia'
              ? detailsMachine.trim()
              : undefined,
          description:
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
            }
          : prev
      )
      setSelected(null)
    } catch (err: any) {
      alert(err?.message || 'Error assignant')
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
                meta?.supplierResolvedAt !== undefined ? meta.supplierResolvedAt : prev.supplierResolvedAt,
            }
          : prev
      )
    } catch (err: any) {
      alert(err?.message || 'No s’ha pogut actualitzar')
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
    } catch (err: any) {
      alert(err?.message || 'No s’ha pogut reobrir')
    }
  }

  const handleAssignVehicle = async (
    ticket: Ticket,
    needsVehicle: boolean,
    plate: string | null
  ) => {
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          needsVehicle,
          vehiclePlate: needsVehicle ? plate : null,
          vehicleId: null,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) =>
        prev ? { ...prev, needsVehicle, vehiclePlate: needsVehicle ? plate : null } : prev
      )
    } catch (err: any) {
      alert(err?.message || 'No s’ha pogut guardar')
    }
  }

  const handleUpdateDetails = async () => {
    if (!selected) return
    try {
      const res = await fetch(`/api/maintenance/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: detailsLocation.trim(),
          machine: detailsMachine.trim(),
          description: detailsDescription.trim(),
          priority: detailsPriority,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
      setSelected((prev) =>
        prev
          ? {
              ...prev,
              location: detailsLocation.trim(),
              machine: detailsMachine.trim(),
              description: detailsDescription.trim(),
              priority: detailsPriority,
            }
          : prev
      )
    } catch (err: any) {
      alert(err?.message || 'No s’han pogut desar els canvis')
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
      if (json?.ticket) {
        setSelected(json.ticket)
      }
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut enviar al proveidor')
    } finally {
      setExternalizeBusy(false)
    }
  }

  const loadAvailability = async () => {
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
      const list = Array.isArray(json?.treballadors) ? json.treballadors : []
      setAvailableIds(list.map((p: any) => p.id))
    } finally {
      setAvailabilityLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAvailability()
    }, 300)
    return () => window.clearTimeout(timer)
  }, [assignDate, assignStartTime, assignDuration])

  const handleDelete = async (ticket: Ticket) => {
    if (!confirm('Eliminar el ticket?')) return
    try {
      const res = await fetch(`/api/maintenance/tickets/${ticket.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchTickets()
    } catch (err: any) {
      alert(err?.message || 'No s’ha pogut eliminar')
    }
  }

  const groupedTickets = useMemo(() => {
    const start = parseISO(filters.start)
    const end = parseISO(filters.end)
    const list = tickets.filter((t) => {
      const base = (t as any).plannedStart || (t as any).assignedAt || t.createdAt
      const date = typeof base === 'string' ? new Date(base) : new Date(Number(base))
      if (Number.isNaN(date.getTime())) return false
      return date >= start && date <= new Date(end.getTime() + 24 * 60 * 60 * 1000)
    })
    const grouped = list.reduce<Record<string, Ticket[]>>((acc, t) => {
      const base = (t as any).plannedStart || (t as any).assignedAt || t.createdAt
      const day =
        typeof base === 'string'
          ? base.slice(0, 10)
          : format(new Date(Number(base)), 'yyyy-MM-dd')
      acc[day] ||= []
      acc[day].push(t)
      return acc
    }, {})
    return Object.entries(grouped).sort(([a], [b]) => (a > b ? 1 : -1))
  }, [tickets, filters.start, filters.end])

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
    createTicketType,
    setCreateTicketType,
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
  }
}


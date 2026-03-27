'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTransports } from '@/hooks/useTransports'
import { isMaintenanceCapDepartment } from '@/lib/accessControl'
import { formatDateTimeValue } from '@/lib/date-format'
import { normalizeRole } from '@/lib/roles'
import AssignTicketModal from '@/app/menu/manteniment/tickets/components/AssignTicketModal'
import type {
  MachineItem,
  Ticket,
  TicketPriority,
  TransportItem,
  UserItem,
} from '@/app/menu/manteniment/tickets/types'

type Props = {
  ticketId: string
  initialDate: string
  initialStartTime: string
  initialDurationMinutes: number
  initialTicket?: Ticket | null
  locations: string[]
  machines: MachineItem[]
  users: UserItem[]
  onClose: () => void
  onRefresh: () => Promise<void>
}

const normalizeDept = (raw?: string) =>
  (raw || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const formatDateTime = (value?: number | string | null) => {
  return formatDateTimeValue(value, '')
}

const STATUS_LABELS = {
  nou: 'Nou',
  assignat: 'Assignat',
  en_curs: 'En curs',
  espera: 'Espera',
  fet: 'Fet',
  no_fet: 'No fet',
  resolut: 'Validat',
  validat: 'Validat',
} as const

export default function PlannerTicketModal({
  ticketId,
  initialDate,
  initialStartTime,
  initialDurationMinutes,
  initialTicket,
  locations,
  machines,
  users,
  onClose,
  onRefresh,
}: Props) {
  const { data: session } = useSession()
  const role = normalizeRole((session?.user as any)?.role || '')
  const department = normalizeDept((session?.user as any)?.department || '')
  const canValidate = role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(department))
  const canReopen = role === 'admin' || (role === 'cap' && isMaintenanceCapDepartment(department))
  const canExternalize =
    role === 'admin' ||
    role === 'direccio' ||
    (role === 'cap' &&
      (isMaintenanceCapDepartment(department) ||
        department === 'decoracio' ||
        department === 'decoracions' ||
        department === 'decoracion'))

  const [selected, setSelected] = useState<Ticket | null>(initialTicket || null)
  const [assignBusy, setAssignBusy] = useState(false)
  const [externalizeBusy, setExternalizeBusy] = useState(false)
  const [assignDate, setAssignDate] = useState(initialDate)
  const [assignStartTime, setAssignStartTime] = useState(initialStartTime)
  const [assignDuration, setAssignDuration] = useState(() => {
    const hours = Math.floor(initialDurationMinutes / 60)
    const minutes = initialDurationMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  })
  const [workerCount, setWorkerCount] = useState(1)
  const [availableIds, setAvailableIds] = useState<string[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [detailsLocation, setDetailsLocation] = useState('')
  const [detailsWorkLocation, setDetailsWorkLocation] = useState('')
  const [detailsMachine, setDetailsMachine] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsPriority, setDetailsPriority] = useState<TicketPriority>('normal')
  const { data: transports } = useTransports()
  const availabilityCacheRef = useRef<Map<string, string[]>>(new Map())

  const maintenanceUsers = useMemo(
    () =>
      users.filter((u) => {
        const dept = normalizeDept(u.departmentLower || u.department)
        const userRole = normalizeRole(u.role || '')
        const isAssignable = userRole === 'treballador' || userRole === 'cap'
        return isAssignable && dept === 'manteniment'
      }),
    [users]
  )

  const furgonetes = useMemo(
    () =>
      (transports as TransportItem[]).filter((t) => t.type === 'furgonetaManteniment'),
    [transports]
  )

  const applyTicketState = useCallback((ticket: Ticket) => {
    setSelected(ticket)
    setDetailsLocation(ticket.location || '')
    setDetailsWorkLocation(ticket.workLocation || '')
    setDetailsMachine(ticket.machine || '')
    setDetailsDescription(ticket.operatorTitle || '')
    setDetailsPriority(ticket.priority || 'normal')
    setWorkerCount(Math.max(1, ticket.assignedToIds?.length || ticket.assignedToNames?.length || 1))
  }, [])

  const loadTicket = useCallback(async () => {
    const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(ticketId)}`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const ticket = json?.ticket as Ticket
    applyTicketState(ticket)
    return ticket
  }, [applyTicketState, ticketId])

  useEffect(() => {
    if (initialTicket) {
      applyTicketState(initialTicket)
    } else {
      setSelected(null)
    }
  }, [applyTicketState, initialTicket, ticketId])

  useEffect(() => {
    if (initialTicket) return
    void loadTicket().catch(() => undefined)
  }, [initialTicket, loadTicket])

  const computePlanning = () => {
    if (!assignDate || !assignStartTime || !assignDuration) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }
    const start = new Date(`${assignDate}T${assignStartTime}:00`)
    if (Number.isNaN(start.getTime())) {
      return { plannedStart: null, plannedEnd: null, estimatedMinutes: null }
    }
    const parts = assignDuration.trim().split(':')
    const hours = Number(parts[0] || 0)
    const mins = Number(parts[1] || 0)
    const minutes = Math.max(1, hours * 60 + mins)
    const end = new Date(start.getTime() + minutes * 60 * 1000)
    return { plannedStart: start.getTime(), plannedEnd: end.getTime(), estimatedMinutes: minutes }
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
    const availabilityKey = `${sd}|${ed}|${st}|${et}`

    const cached = availabilityCacheRef.current.get(availabilityKey)
    if (cached) {
      setAvailableIds(cached)
      return
    }

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
      const nextIds = list.map((p: any) => p.id)
      availabilityCacheRef.current.set(availabilityKey, nextIds)
      setAvailableIds(nextIds)
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

  const handleAssign = async (ticket: Ticket, assignedIds: string[], assignedNames: string[]) => {
    try {
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
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json().catch(() => null)
      if (json?.ticket) applyTicketState(json.ticket as Ticket)
      await onRefresh()
      onClose()
    } catch (err: any) {
      alert(err?.message || 'Error assignant')
    } finally {
      setAssignBusy(false)
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
      const json = await res.json().catch(() => null)
      if (json?.ticket) {
        applyTicketState(json.ticket as Ticket)
      } else {
        await loadTicket()
      }
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut guardar')
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
      const json = await res.json().catch(() => null)
      if (json?.ticket) applyTicketState(json.ticket as Ticket)
      await onRefresh()
    } catch (err: any) {
      alert(err?.message || 'No s han pogut desar els canvis')
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
      const json = await res.json().catch(() => null)
      if (json?.ticket) applyTicketState(json.ticket as Ticket)
      await onRefresh()
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut reobrir')
    }
  }

  const handleStatusChange = async (
    ticket: Ticket,
    status: keyof typeof STATUS_LABELS,
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
      const json = await res.json().catch(() => null)
      if (json?.ticket) applyTicketState(json.ticket as Ticket)
      await onRefresh()
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut actualitzar')
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
      if (json?.ticket) applyTicketState(json.ticket as Ticket)
      await onRefresh()
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut enviar al proveidor')
    } finally {
      setExternalizeBusy(false)
    }
  }

  if (!selected) return null

  return (
    <AssignTicketModal
      ticket={selected}
      assignBusy={assignBusy}
      externalizeBusy={externalizeBusy}
      assignDate={assignDate}
      setAssignDate={setAssignDate}
      assignStartTime={assignStartTime}
      setAssignStartTime={setAssignStartTime}
      assignDuration={assignDuration}
      setAssignDuration={setAssignDuration}
      workerCount={workerCount}
      setWorkerCount={setWorkerCount}
      maintenanceUsers={maintenanceUsers}
      availableIds={availableIds}
      availabilityLoading={availabilityLoading}
      furgonetes={furgonetes}
      locations={locations}
      machines={machines}
      detailsLocation={detailsLocation}
      setDetailsLocation={setDetailsLocation}
      detailsWorkLocation={detailsWorkLocation}
      setDetailsWorkLocation={setDetailsWorkLocation}
      detailsMachine={detailsMachine}
      setDetailsMachine={setDetailsMachine}
      detailsDescription={detailsDescription}
      setDetailsDescription={setDetailsDescription}
      detailsPriority={detailsPriority}
      setDetailsPriority={setDetailsPriority}
      canValidate={canValidate}
      canReopen={canReopen}
      canExternalize={canExternalize}
      onUpdateDetails={handleUpdateDetails}
      formatDateTime={formatDateTime}
      statusLabels={STATUS_LABELS}
      showHistory={showHistory}
      setShowHistory={setShowHistory}
      setSelected={setSelected}
      onAssign={handleAssign}
      onStatusChange={handleStatusChange}
      onAssignVehicle={handleAssignVehicle}
      onReopen={handleReopen}
      onExternalize={handleExternalize}
      onClose={onClose}
    />
  )
}

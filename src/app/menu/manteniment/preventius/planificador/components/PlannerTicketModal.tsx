'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTransports } from '@/hooks/useTransports'
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
  if (!value) return ''
  const date =
    typeof value === 'string'
      ? new Date(value)
      : typeof value === 'number'
        ? new Date(value)
        : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
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
  const canReopen = role === 'admin' || (role === 'cap' && department === 'manteniment')
  const canExternalize =
    role === 'admin' ||
    role === 'direccio' ||
    (role === 'cap' &&
      (department === 'manteniment' ||
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
  const [detailsMachine, setDetailsMachine] = useState('')
  const [detailsDescription, setDetailsDescription] = useState('')
  const [detailsPriority, setDetailsPriority] = useState<TicketPriority>('normal')
  const { data: transports } = useTransports()

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

  const loadTicket = async () => {
    const res = await fetch(`/api/maintenance/tickets/${encodeURIComponent(ticketId)}`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    const ticket = json?.ticket as Ticket
    setSelected(ticket)
    setDetailsLocation(ticket.location || '')
    setDetailsMachine(ticket.machine || '')
    setDetailsDescription(ticket.description || '')
    setDetailsPriority(ticket.priority || 'normal')
    setWorkerCount(Math.max(1, ticket.assignedToIds?.length || ticket.assignedToNames?.length || 1))
  }

  useEffect(() => {
    setSelected(initialTicket || null)
    if (initialTicket) {
      setDetailsLocation(initialTicket.location || '')
      setDetailsMachine(initialTicket.machine || '')
      setDetailsDescription(initialTicket.description || '')
      setDetailsPriority(initialTicket.priority || 'normal')
      setWorkerCount(
        Math.max(1, initialTicket.assignedToIds?.length || initialTicket.assignedToNames?.length || 1)
      )
    }
  }, [initialTicket, ticketId])

  useEffect(() => {
    void loadTicket().catch(() => undefined)
  }, [ticketId])

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
      await Promise.all([loadTicket(), onRefresh()])
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
      await loadTicket()
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
          location: detailsLocation.trim(),
          machine: detailsMachine.trim(),
          description: detailsDescription.trim(),
          priority: detailsPriority,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await Promise.all([loadTicket(), onRefresh()])
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
      await Promise.all([loadTicket(), onRefresh()])
    } catch (err: any) {
      alert(err?.message || 'No s ha pogut reobrir')
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
      await Promise.all([loadTicket(), onRefresh()])
      if (json?.ticket) {
        setSelected(json.ticket)
      }
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
      detailsMachine={detailsMachine}
      setDetailsMachine={setDetailsMachine}
      detailsDescription={detailsDescription}
      setDetailsDescription={setDetailsDescription}
      detailsPriority={detailsPriority}
      setDetailsPriority={setDetailsPriority}
      canReopen={canReopen}
      canExternalize={canExternalize}
      onUpdateDetails={handleUpdateDetails}
      formatDateTime={formatDateTime}
      statusLabels={STATUS_LABELS}
      showHistory={showHistory}
      setShowHistory={setShowHistory}
      setSelected={setSelected}
      onAssign={handleAssign}
      onAssignVehicle={handleAssignVehicle}
      onReopen={handleReopen}
      onExternalize={handleExternalize}
      onClose={onClose}
    />
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
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
import { minutesFromTime, normalizeName, timeFromMinutes } from '../utils'

type Props = {
  ticketId: string
  initialDate: string
  initialStartTime: string
  initialDurationMinutes: number
  initialTicket?: Ticket | null
  locations: string[]
  machines: MachineItem[]
  users: UserItem[]
  /** Planificador: si es passen, la disponibilitat és només la graella; si no, tots els operaris de manteniment es poden triar */
  weekStart?: Date
  dayCount?: number
  availableWorkers?: (
    dayIndex: number,
    start: string,
    end: string,
    ignoreId?: string
  ) => Array<{ id: string; name: string }>
  onDeletePlanned?: (() => void | Promise<void>) | null
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
  weekStart: weekStartProp,
  dayCount: dayCountProp,
  availableWorkers: availableWorkersProp,
  onDeletePlanned,
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
  const [availableNameNorms, setAvailableNameNorms] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [detailsLocation, setDetailsLocation] = useState('')
  const [detailsWorkLocation, setDetailsWorkLocation] = useState('')
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

  const assignEndTime = useMemo(() => {
    if (!assignStartTime || !assignDuration) return ''
    const parts = assignDuration.trim().split(':')
    const addMin = Number(parts[0] || 0) * 60 + Number(parts[1] || 0)
    if (!Number.isFinite(addMin) || addMin < 1) return ''
    const sm = minutesFromTime(assignStartTime)
    return timeFromMinutes(sm + addMin)
  }, [assignStartTime, assignDuration])

  const plannerDayIndex = useMemo(() => {
    if (!assignDate || !weekStartProp) return -1
    const picked = parseISO(assignDate)
    if (Number.isNaN(picked.getTime())) return -1
    return differenceInCalendarDays(picked, weekStartProp)
  }, [assignDate, weekStartProp])

  useEffect(() => {
    if (!assignDate || !assignStartTime || !assignEndTime) {
      setAvailableIds([])
      setAvailableNameNorms([])
      return
    }
    if (!availableWorkersProp || !weekStartProp || dayCountProp == null) {
      setAvailableIds(maintenanceUsers.map((u) => String(u.id)).filter(Boolean))
      setAvailableNameNorms(
        maintenanceUsers.map((u) => normalizeName(String(u.name || ''))).filter(Boolean)
      )
      return
    }
    const inWeek = plannerDayIndex >= 0 && plannerDayIndex < dayCountProp
    const dayIdx = inWeek ? plannerDayIndex : -1
    const list = availableWorkersProp(dayIdx, assignStartTime, assignEndTime, ticketId)
    setAvailableIds(list.map((p) => String(p.id || '')).filter(Boolean))
    setAvailableNameNorms(
      list.map((p) => normalizeName(String(p.name || ''))).filter(Boolean)
    )
  }, [
    assignDate,
    assignStartTime,
    assignEndTime,
    assignDuration,
    availableWorkersProp,
    dayCountProp,
    maintenanceUsers,
    plannerDayIndex,
    ticketId,
    weekStartProp,
  ])

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
      availableNameNorms={availableNameNorms}
      availabilityLoading={false}
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
      onDeletePlanned={onDeletePlanned}
      onClose={onClose}
    />
  )
}

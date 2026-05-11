'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { CarFront, CalendarDays, CheckCircle2, XCircle } from 'lucide-react'

import ModuleHeader from '@/components/layout/ModuleHeader'
import type { FiltersState } from '@/components/layout/FiltersBar'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useTransports } from '@/hooks/useTransports'
import {
  COMMERCIAL_RESERVATION_STATUS_LABELS,
  type CommercialReservation,
  type CommercialReservationStatus,
} from '@/lib/commercialReservations'
import { normalizeRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

type TabId = 'sollicitud' | 'validacio'

type SessionUser = {
  id?: string
  role?: string | null
  name?: string | null
  isTransportLead?: boolean | null
}

type AssignmentRow = {
  id: string
  plate?: string
  vehicleType?: string
  name?: string
  startDate?: string
  startTime?: string
  endTime?: string
}

type AssignmentItem = {
  eventCode: string
  day: string
  eventStartTime: string
  eventEndTime?: string
  eventName: string
  location: string
  source?: 'quadrant' | 'commercialReservation'
  rows?: AssignmentRow[]
}

function monthMatrix(baseDate: Date) {
  const first = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
  const firstWeekDay = (first.getDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - firstWeekDay)

  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(gridStart)
    day.setDate(gridStart.getDate() + index)
    return day
  })
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function prettyDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function monthBounds(baseDate: Date) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
  return {
    start: isoDate(start),
    end: isoDate(end),
  }
}

export default function ReservaComercialsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const user = (session?.user || {}) as SessionUser
  const canValidate =
    ['admin', 'direccio', 'cap'].includes(normalizeRole(String(user.role || ''))) ||
    user.isTransportLead === true

  const initialFilters = useMemo<FiltersState>(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 })
    const end = endOfWeek(new Date(), { weekStartsOn: 1 })
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd'),
      mode: 'week',
      status: '__all__',
    }
  }, [])

  const initialTab: TabId =
    searchParams?.get('tab') === 'validacio' && canValidate ? 'validacio' : 'sollicitud'

  const [tab, setTab] = useState<TabId>(initialTab)
  const [filters, setFilters] = useState<FiltersState>(initialFilters)
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [reservations, setReservations] = useState<CommercialReservation[]>([])
  const [assignmentItems, setAssignmentItems] = useState<AssignmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('13:00')
  const [destination, setDestination] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedVehicleByReservation, setSelectedVehicleByReservation] = useState<Record<string, string>>({})
  const todayIso = useMemo(() => isoDate(new Date()), [])

  const { data: transports = [] } = useTransports()
  const commercialFleet = useMemo(
    () => transports.filter((transport) => transport.type === 'comercial'),
    [transports]
  )

  const loadReservations = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/logistica/reserva-comercials', { cache: 'no-store' })
      if (!res.ok) throw new Error('No s han pogut carregar les reserves')
      const data = await res.json()
      setReservations(Array.isArray(data?.reservations) ? data.reservations : [])
    } catch (err) {
      setReservations([])
      setError(err instanceof Error ? err.message : 'Error carregant reserves')
    } finally {
      setLoading(false)
    }
  }

  const loadAssignmentItems = async (targetMonth: Date) => {
    try {
      const { start, end } = monthBounds(targetMonth)
      const res = await fetch(
        `/api/transports/assignacions?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error('No s han pogut carregar les assignacions')
      const data = await res.json()
      setAssignmentItems(Array.isArray(data?.items) ? data.items : [])
    } catch {
      setAssignmentItems([])
    }
  }

  useEffect(() => {
    void loadReservations()
  }, [])

  useEffect(() => {
    void loadAssignmentItems(monthDate)
  }, [monthDate])

  useEffect(() => {
    if (!canValidate && tab !== 'sollicitud') setTab('sollicitud')
  }, [canValidate, tab])

  const setTabAndUrl = (nextTab: TabId) => {
    setTab(nextTab)
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('tab', nextTab)
    router.replace(`/menu/logistica/reserva-comercials?${params.toString()}`, {
      scroll: false,
    })
  }

  const handleValidationDatesChange = (next: SmartFiltersChange) => {
    if (!next.start || !next.end) return
    setFilters((prev) => ({
      ...prev,
      start: next.start || prev.start,
      end: next.end || prev.end,
      mode: (next.mode as FiltersState['mode']) || prev.mode,
    }))
  }

  const assignmentRows = useMemo(() => {
    const commercialPlates = new Set(
      commercialFleet.map((vehicle) => String(vehicle.plate || '').trim().toUpperCase())
    )

    return assignmentItems
      .filter((item) => item.source !== 'commercialReservation')
      .flatMap((item) =>
        (Array.isArray(item.rows) ? item.rows : [])
          .filter((row) => {
            const plate = String(row.plate || '').trim().toUpperCase()
            return String(row.vehicleType || '').trim() === 'comercial' || commercialPlates.has(plate)
          })
          .map((row) => ({
            id: row.id,
            date: String(row.startDate || item.day || '').trim(),
            startTime: String(row.startTime || item.eventStartTime || '').trim(),
            endTime: String(row.endTime || item.eventEndTime || row.startTime || item.eventStartTime || '').trim(),
            plate: String(row.plate || '').trim(),
            label: String(item.eventName || '').trim() || 'Assignació',
          }))
      )
      .filter((row) => row.date && row.startTime)
  }, [assignmentItems, commercialFleet])

  const statsByDay = useMemo(() => {
    const map = new Map<string, { confirmed: number; pending: number }>()
    for (const reservation of reservations) {
      const current = map.get(reservation.date) || { confirmed: 0, pending: 0 }
      if (reservation.status === 'confirmed') current.confirmed += 1
      if (reservation.status === 'pending') current.pending += 1
      map.set(reservation.date, current)
    }
    return map
  }, [reservations])

  const reservationsByDay = useMemo(() => {
    const map = new Map<string, CommercialReservation[]>()
    for (const reservation of reservations) {
      if (reservation.status === 'rejected' || reservation.status === 'cancelled') continue
      const current = map.get(reservation.date) || []
      current.push(reservation)
      map.set(reservation.date, current)
    }
    for (const [key, list] of map.entries()) {
      map.set(key, [...list].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    }
    return map
  }, [reservations])

  const assignmentRowsByDay = useMemo(() => {
    const map = new Map<string, typeof assignmentRows>()
    for (const row of assignmentRows) {
      const current = map.get(row.date) || []
      current.push(row)
      map.set(row.date, current)
    }
    return map
  }, [assignmentRows])

  const occupiedCommercialPlatesByDay = useMemo(() => {
    const map = new Map<string, Set<string>>()

    for (const reservation of reservations) {
      if (reservation.status !== 'confirmed' || !reservation.assignedVehiclePlate) continue
      const key = String(reservation.date || '').trim()
      if (!key) continue
      const current = map.get(key) || new Set<string>()
      current.add(String(reservation.assignedVehiclePlate).trim().toUpperCase())
      map.set(key, current)
    }

    for (const row of assignmentRows) {
      if (!row.plate) continue
      const current = map.get(row.date) || new Set<string>()
      current.add(String(row.plate).trim().toUpperCase())
      map.set(row.date, current)
    }

    return map
  }, [assignmentRows, reservations])

  const myReservations = useMemo(
    () => reservations.filter((reservation) => reservation.requesterId === user.id),
    [reservations, user.id]
  )

  const confirmedReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) => reservation.status === 'confirmed' && reservation.assignedVehicleId
      ),
    [reservations]
  )

  const statusFilter = filters.status ?? '__all__'
  const manageableReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const isManageable =
          reservation.status === 'pending' || reservation.status === 'confirmed'
        if (!isManageable) return false
        if (filters.start && reservation.date < filters.start) return false
        if (filters.end && reservation.date > filters.end) return false
        if (statusFilter !== '__all__' && reservation.status !== statusFilter) return false
        return true
      }),
    [filters.end, filters.start, reservations, statusFilter]
  )

  const availableVehiclesForReservation = (target: CommercialReservation) => {
    return commercialFleet.filter((vehicle) => {
      if (vehicle.available === false) return false

      const plateKey = String(vehicle.plate || '').trim().toUpperCase()
      const hasAssignmentConflict = assignmentRows.some(
        (row) =>
          String(row.plate || '').trim().toUpperCase() === plateKey &&
          row.date === target.date &&
          row.startTime < target.endTime &&
          target.startTime < row.endTime
      )
      if (hasAssignmentConflict) return false

      return !confirmedReservations.some(
        (reservation) =>
          reservation.id !== target.id &&
          reservation.assignedVehicleId === vehicle.id &&
          reservation.date === target.date &&
          reservation.startTime < target.endTime &&
          target.startTime < reservation.endTime
      )
    })
  }

  const handleOpenReservation = (dayIso: string) => {
    if (dayIso < todayIso) return
    setSelectedDay(dayIso)
    setDialogOpen(true)
  }

  const resetForm = () => {
    setStartTime('09:00')
    setEndTime('13:00')
    setDestination('')
    setReason('')
    setNotes('')
  }

  const handleSubmit = async () => {
    if (!destination.trim() || !reason.trim()) return
    if (selectedDay < todayIso) {
      setError("Només es poden fer reserves d'avui en endavant")
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/logistica/reserva-comercials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDay,
          startTime,
          endTime,
          destination: destination.trim(),
          reason: reason.trim(),
          notes: notes.trim(),
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'No s ha pogut crear la sol·licitud')
      }

      resetForm()
      setDialogOpen(false)
      await loadReservations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desant la reserva')
    } finally {
      setSaving(false)
    }
  }

  const handleValidation = async (id: string, status: CommercialReservationStatus) => {
    try {
      setSaving(true)
      const assignedVehicleId =
        status === 'confirmed' ? String(selectedVehicleByReservation[id] || '').trim() : ''
      const res = await fetch(`/api/logistica/reserva-comercials/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          assignedVehicleId: assignedVehicleId || undefined,
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'No s ha pogut validar la reserva')
      }

      await loadReservations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error validant la reserva')
    } finally {
      setSaving(false)
    }
  }

  const handleCancelReservation = async (id: string) => {
    try {
      setSaving(true)
      const res = await fetch(`/api/logistica/reserva-comercials/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'No s ha pogut anul·lar la reserva')
      }
      await loadReservations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error anul·lant la reserva')
    } finally {
      setSaving(false)
    }
  }

  const days = useMemo(() => monthMatrix(monthDate), [monthDate])
  const monthLabel = monthDate.toLocaleDateString('ca-ES', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="w-full flex flex-col gap-6 sm:gap-8">
      <ModuleHeader
        title="Reserva comercials / Calendari i validació"
        subtitle="Sol·licitud simple per calendari i assignació per cap de transports"
        icon={<CarFront className="h-8 w-8 text-sky-700" />}
        mainHref="/menu/logistica"
      />

      <section className="space-y-5 px-2 pb-8 sm:px-4">
        <div className="flex flex-wrap gap-2 border-b border-border pb-3">
          <button
            type="button"
            onClick={() => setTabAndUrl('sollicitud')}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition shadow-sm',
              tab === 'sollicitud'
                ? 'bg-sky-700 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100'
            )}
          >
            Sol·licitud
          </button>

          {canValidate ? (
            <button
              type="button"
              onClick={() => setTabAndUrl('validacio')}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition shadow-sm',
                tab === 'validacio'
                  ? 'bg-sky-700 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100'
              )}
            >
              Validació
            </button>
          ) : null}
        </div>

        {error ? (
          <Card className="rounded-2xl border-red-200 bg-red-50">
            <CardContent className="px-4 py-3 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : null}

        {tab === 'sollicitud' ? (
          <div className="space-y-5">
            <Card className="rounded-3xl border-sky-100 bg-white shadow-sm">
              <CardContent className="px-4 py-5 sm:px-6">
                <div className="flex items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setMonthDate(
                        (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1)
                      )
                    }
                  >
                    Mes anterior
                  </Button>

                  <div className="text-center">
                    <div className="text-xs font-medium uppercase tracking-[0.24em] text-sky-700">
                      Calendari
                    </div>
                    <div className="text-2xl font-semibold capitalize text-slate-900">
                      {monthLabel}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setMonthDate(
                        (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1)
                      )
                    }
                  >
                    Mes següent
                  </Button>
                </div>

                <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((label) => (
                    <div key={label}>{label}</div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-7 gap-2">
                  {days.map((day) => {
                    const dayIso = isoDate(day)
                    const sameMonth = day.getMonth() === monthDate.getMonth()
                    const isPastDay = dayIso < todayIso
                    const dayReservations = reservationsByDay.get(dayIso) || []
                    const dayAssignments = assignmentRowsByDay.get(dayIso) || []
                    const occupiedPlates = occupiedCommercialPlatesByDay.get(dayIso)
                    const available = Math.max(commercialFleet.length - (occupiedPlates?.size || 0), 0)
                    const stats = statsByDay.get(dayIso) || { confirmed: 0, pending: 0 }
                    void stats

                    return (
                      <button
                        key={dayIso}
                        type="button"
                        onClick={() => handleOpenReservation(dayIso)}
                        disabled={isPastDay}
                        className={cn(
                          'min-h-[132px] rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55',
                          sameMonth
                            ? isPastDay
                              ? 'border-gray-100 bg-gray-100 text-gray-400'
                              : 'border-sky-100 bg-sky-50/50 hover:border-sky-300 hover:bg-sky-50'
                            : 'border-gray-100 bg-gray-50 text-gray-400'
                        )}
                      >
                        <div className="text-sm font-semibold">{day.getDate()}</div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">
                            {isPastDay ? 'Tancat' : `${available} lliure${available === 1 ? '' : 's'}`}
                          </span>
                          {!isPastDay && dayReservations.length > 0 ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                              {dayReservations.length} reserva{dayReservations.length === 1 ? '' : 's'}
                            </span>
                          ) : null}
                          {!isPastDay && dayAssignments.length > 0 ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              {dayAssignments.length} assign.
                            </span>
                          ) : null}
                        </div>

                        {!isPastDay && dayReservations.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {dayReservations.slice(0, 2).map((reservation) => {
                              const isPending = reservation.status === 'pending'
                              return (
                                <div
                                  key={reservation.id}
                                  className={cn(
                                    'rounded-xl border bg-white px-2.5 py-2 text-[11px] shadow-sm',
                                    isPending ? 'border-amber-200' : 'border-emerald-200'
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-800">
                                      {reservation.startTime}
                                    </span>
                                    <span
                                      className={cn(
                                        'truncate text-right font-medium',
                                        isPending ? 'text-amber-700' : 'text-emerald-700'
                                      )}
                                    >
                                      {reservation.assignedVehiclePlate || 'Pendent'}
                                    </span>
                                  </div>
                                  <div className="mt-1 truncate text-slate-600">
                                    {reservation.requesterName}
                                  </div>
                                </div>
                              )
                            })}
                            {dayReservations.length > 2 ? (
                              <div className="pl-1 text-[11px] font-medium text-slate-500">
                                +{dayReservations.length - 2} més
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {!isPastDay && dayAssignments.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {dayAssignments.slice(0, 1).map((assignment) => (
                              <div
                                key={`assignment-${assignment.id}`}
                                className="rounded-xl border border-violet-200 bg-white px-2.5 py-2 text-[11px] shadow-sm"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-slate-800">
                                    {assignment.startTime}
                                  </span>
                                  <span className="truncate text-right font-medium text-violet-700">
                                    {assignment.plate || 'Ocupat'}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-slate-600">{assignment.label}</div>
                              </div>
                            ))}
                            {dayAssignments.length > 1 ? (
                              <div className="pl-1 text-[11px] font-medium text-slate-500">
                                +{dayAssignments.length - 1} assignació més
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card className="rounded-3xl border-gray-200 bg-white">
                <CardContent className="px-4 py-5">
                  <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <CalendarDays className="h-5 w-5 text-sky-700" />
                    Les meves sol·licituds
                  </div>

                  <div className="mt-4 space-y-3">
                    {loading ? <div className="text-sm text-slate-500">Carregant...</div> : null}
                    {!loading && myReservations.length === 0 ? (
                      <div className="text-sm text-slate-500">Encara no tens cap sol·licitud.</div>
                    ) : null}

                    {myReservations.map((reservation) => (
                      <div
                        key={reservation.id}
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              reservation.status === 'confirmed'
                                ? 'success'
                                : reservation.status === 'cancelled'
                                  ? 'secondary'
                                  : reservation.status === 'rejected'
                                    ? 'destructive'
                                    : 'warning'
                            }
                          >
                            {COMMERCIAL_RESERVATION_STATUS_LABELS[reservation.status]}
                          </Badge>
                          {reservation.assignedVehiclePlate ? (
                            <Badge variant="outline">{reservation.assignedVehiclePlate}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 font-semibold text-slate-900">{reservation.reason}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {prettyDate(reservation.date)} · {reservation.startTime} - {reservation.endTime}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">{reservation.destination}</div>
                        {reservation.status === 'pending' || reservation.status === 'confirmed' ? (
                          <div className="mt-3 flex justify-end">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void handleCancelReservation(reservation.id)}
                              disabled={saving}
                              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            >
                              Anul·lar reserva
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-sky-100 bg-sky-50">
                <CardContent className="px-4 py-5">
                  <div className="text-sm font-semibold text-sky-900">Com funciona</div>
                  <div className="mt-3 space-y-3 text-sm text-sky-900/90">
                    <p>1. Veus el calendari i quants comercials hi ha lliures cada dia.</p>
                    <p>2. Clices el dia i fas la sol·licitud en dos minuts.</p>
                    <p>3. El cap de transports rep un avís, valida i assigna vehicle.</p>
                    <p>4. El comercial rep la notificació amb la confirmació o el rebuig.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'validacio' && canValidate ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
                <SmartFilters
                  modeDefault="week"
                  modeOptions={['week', 'month', 'year', 'day', 'range']}
                  role="Treballador"
                  showDepartment={false}
                  showWorker={false}
                  showLocation={false}
                  showStatus={false}
                  onChange={handleValidationDatesChange}
                  initialStart={filters.start}
                  initialEnd={filters.end}
                />

                <div className="flex flex-nowrap gap-2 lg:ml-auto">
                  {[
                    { value: '__all__', label: 'Totes' },
                    { value: 'pending', label: 'Pendents' },
                    { value: 'confirmed', label: 'Confirmades' },
                  ].map((option) => {
                    const active = (filters.status ?? '__all__') === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            status: option.value,
                          }))
                        }
                        className={cn(
                          'min-h-10 rounded-full border px-4 text-sm font-semibold transition',
                          active
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50'
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <Card className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <CardContent className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Gestió de reserves</div>
                    <div className="mt-1 text-sm text-slate-500">
                      Tria vehicle, valida o anul·la la reserva des d'aquí.
                    </div>
                  </div>
                  <Badge variant="warning" className="px-3 py-1 text-sm">
                    {manageableReservations.length} activa{manageableReservations.length === 1 ? '' : 's'}
                  </Badge>
                </div>

                <div className="mt-4 space-y-3">
                  {loading ? <div className="text-sm text-slate-500">Carregant...</div> : null}
                  {!loading && manageableReservations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-slate-500">
                      No hi ha reserves per aquest filtre.
                    </div>
                  ) : null}

                  {manageableReservations.map((reservation) => {
                    const vehicleOptions = availableVehiclesForReservation(reservation)
                    const selectedVehicleId =
                      selectedVehicleByReservation[reservation.id] || reservation.assignedVehicleId || ''
                    const isPending = reservation.status === 'pending'
                    const canConfirm =
                      isPending &&
                      selectedVehicleId &&
                      vehicleOptions.some((vehicle) => vehicle.id === selectedVehicleId)

                    return (
                      <div
                        key={reservation.id}
                        className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-4 shadow-sm"
                      >
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_340px]">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={isPending ? 'warning' : 'success'}>
                                {isPending ? 'Pendent' : 'Confirmada'}
                              </Badge>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                {prettyDate(reservation.date)} · {reservation.startTime} - {reservation.endTime}
                              </span>
                              {reservation.assignedVehiclePlate ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  {reservation.assignedVehiclePlate}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 text-lg font-semibold leading-tight text-slate-900">
                              {reservation.reason}
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Comercial
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-800">
                                  {reservation.requesterName}
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Destinació
                                </div>
                                <div className="mt-1 text-sm font-medium text-slate-800">
                                  {reservation.destination}
                                </div>
                              </div>
                            </div>

                            {reservation.notes ? (
                              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500">
                                {reservation.notes}
                              </div>
                            ) : null}
                          </div>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                              {isPending ? 'Assignació' : 'Reserva activa'}
                            </div>

                            {isPending ? (
                              <>
                                <label className="mt-2 block text-sm font-medium text-slate-700">
                                  Vehicle a assignar
                                </label>
                                <select
                                  value={selectedVehicleId}
                                  onChange={(event) =>
                                    setSelectedVehicleByReservation((current) => ({
                                      ...current,
                                      [reservation.id]: event.target.value,
                                    }))
                                  }
                                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm"
                                >
                                  <option value="">Selecciona vehicle</option>
                                  {vehicleOptions.map((vehicle) => (
                                    <option key={vehicle.id} value={vehicle.id}>
                                      {vehicle.plate}
                                    </option>
                                  ))}
                                </select>

                                <div className="mt-2 min-h-[18px] text-xs">
                                  {vehicleOptions.length === 0 ? (
                                    <span className="text-red-600">
                                      No hi ha comercials lliures per aquesta franja.
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">
                                      {vehicleOptions.length} vehicle{vehicleOptions.length === 1 ? '' : 's'} disponible{vehicleOptions.length === 1 ? '' : 's'}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <div className="mt-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700">
                                Vehicle assignat:{' '}
                                <span className="font-semibold text-slate-900">
                                  {reservation.assignedVehiclePlate || 'Sense assignar'}
                                </span>
                              </div>
                            )}

                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              {isPending ? (
                                <Button
                                  type="button"
                                  onClick={() => void handleValidation(reservation.id, 'confirmed')}
                                  disabled={saving || !canConfirm}
                                  className="flex-1"
                                >
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Validar
                                </Button>
                              ) : null}
                              {isPending ? (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  onClick={() => void handleValidation(reservation.id, 'rejected')}
                                  disabled={saving}
                                  className="flex-1"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Rebutjar
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant={isPending ? 'outline' : 'destructive'}
                                onClick={() => void handleCancelReservation(reservation.id)}
                                disabled={saving}
                                className={cn(
                                  'flex-1',
                                  isPending
                                    ? 'border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800'
                                    : ''
                                )}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Anul·lar
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova sol·licitud</DialogTitle>
            <DialogDescription>
              Reserva el dia seleccionat i envia la petició a transports.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Dia">
              <Input value={selectedDay} readOnly />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hora inici">
                <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              </Field>
              <Field label="Hora fi">
                <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </Field>
            </div>
            <Field label="Destinació">
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Client o zona"
              />
            </Field>
            <Field label="Motiu">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Visita, reunió o seguiment"
              />
            </Field>
            <Field label="Observacions">
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Indicacions addicionals"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Tancar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={saving || !destination.trim() || !reason.trim()}
            >
              {saving ? 'Enviant...' : 'Enviar sol·licitud'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

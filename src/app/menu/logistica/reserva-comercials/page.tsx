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
  getCommercialReservationDayKeys,
  getCommercialReservationEndDate,
  type CommercialReservation,
  type CommercialReservationStatus,
} from '@/lib/commercialReservations'
import { formatDateOnly } from '@/lib/date-format'
import { normalizeRole } from '@/lib/roles'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'
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
  endDate?: string
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
  return formatDateOnly(value, value)
}

function monthBounds(baseDate: Date) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
  return {
    start: isoDate(start),
    end: isoDate(end),
  }
}

function reservationDateLabel(reservation: Pick<CommercialReservation, 'date' | 'endDate' | 'startTime' | 'endTime'>) {
  const endDate = getCommercialReservationEndDate(reservation)
  if (endDate !== reservation.date) {
    return `${prettyDate(reservation.date)} ${reservation.startTime} -> ${prettyDate(endDate)} ${reservation.endTime}`
  }
  return `${prettyDate(reservation.date)} · ${reservation.startTime} - ${reservation.endTime}`
}

function overlapsDateTimes(
  startA: string,
  startTimeA: string,
  endA: string,
  endTimeA: string,
  startB: string,
  startTimeB: string,
  endB: string,
  endTimeB: string
) {
  return (
    new Date(`${startA}T${startTimeA}:00`) < new Date(`${endB}T${endTimeB}:00`) &&
    new Date(`${startB}T${startTimeB}:00`) < new Date(`${endA}T${endTimeA}:00`)
  )
}

const STANDARD_DAY_START = '08:00'
const STANDARD_DAY_END = '18:00'
const STANDARD_DAY_MINUTES = 10 * 60

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged = [sorted[0]]
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const previous = merged[merged.length - 1]
    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end)
      continue
    }
    merged.push({ ...current })
  }
  return merged
}

function dayAvailabilityVisual(freeRatio: number) {
  const ratio = clamp(freeRatio, 0, 1)
  if (ratio <= 0.15) {
    return {
      tone: 'border-red-200 bg-red-50/70 hover:border-red-300 hover:bg-red-50',
    }
  }
  if (ratio <= 0.45) {
    return {
      tone: 'border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-50',
    }
  }
  if (ratio <= 0.75) {
    return {
      tone: 'border-lime-200 bg-lime-50/70 hover:border-lime-300 hover:bg-lime-50',
    }
  }
  return {
    tone: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-50',
  }
}

function includesDaySpan(
  startDate: string,
  endDate: string,
  targetDay: string
) {
  return startDate <= targetDay && targetDay <= endDate
}

function ensureSetMapValue(map: Map<string, Set<string>>, key: string) {
  const current = map.get(key) || new Set<string>()
  map.set(key, current)
  return current
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
  const [requestFilters, setRequestFilters] = useState<FiltersState>(initialFilters)
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [reservations, setReservations] = useState<CommercialReservation[]>([])
  const [assignmentItems, setAssignmentItems] = useState<AssignmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState(() => isoDate(new Date()))
  const [selectedEndDay, setSelectedEndDay] = useState(() => isoDate(new Date()))
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
    () => transports.filter((transport) => ['comercial', 'furgonetaPetita'].includes(transport.type)),
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
    if (!user.id) return
    void fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearCommercialVehicle' }),
    }).catch(() => {})
  }, [user.id])

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

  const handleRequestDatesChange = (next: SmartFiltersChange) => {
    if (!next.start || !next.end) return
    setRequestFilters((prev) => ({
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
            endDate: String(row.endDate || row.startDate || item.day || '').trim(),
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
      for (const dayKey of getCommercialReservationDayKeys(reservation)) {
        const current = map.get(dayKey) || { confirmed: 0, pending: 0 }
        if (reservation.status === 'confirmed') current.confirmed += 1
        if (reservation.status === 'pending') current.pending += 1
        map.set(dayKey, current)
      }
    }
    return map
  }, [reservations])

  const reservationsByDay = useMemo(() => {
    const map = new Map<string, CommercialReservation[]>()
    for (const reservation of reservations) {
      if (reservation.status === 'rejected' || reservation.status === 'cancelled') continue
      for (const dayKey of getCommercialReservationDayKeys(reservation)) {
        const current = map.get(dayKey) || []
        current.push(reservation)
        map.set(dayKey, current)
      }
    }
    for (const [key, list] of map.entries()) {
      map.set(key, [...list].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    }
    return map
  }, [reservations])

  const assignmentRowsByDay = useMemo(() => {
    const map = new Map<string, typeof assignmentRows>()
    for (const row of assignmentRows) {
      for (const dayKey of getCommercialReservationDayKeys({
        date: String(row.date || '').trim(),
        endDate: String(row.endDate || row.date || '').trim(),
      })) {
        const current = map.get(dayKey) || []
        current.push(row)
        map.set(dayKey, current)
      }
    }
    return map
  }, [assignmentRows])

  const slotKeys = useMemo(
    () => Array.from({ length: 10 }, (_, index) => `${String(8 + index).padStart(2, '0')}:00`),
    []
  )

  const occupiedPlatesByDayAndSlot = useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>()

    const pushPlate = (dayKey: string, slotKey: string, plate: string) => {
      const normalizedPlate = plate.trim().toUpperCase()
      if (!normalizedPlate) return
      const dayMap = map.get(dayKey) || new Map<string, Set<string>>()
      map.set(dayKey, dayMap)
      const slotSet = ensureSetMapValue(dayMap, slotKey)
      slotSet.add(normalizedPlate)
    }

    reservations.forEach((reservation) => {
      if (reservation.status !== 'confirmed' || !reservation.assignedVehiclePlate) return
      const spansMultipleDays = getCommercialReservationEndDate(reservation) !== reservation.date
      for (const dayKey of getCommercialReservationDayKeys(reservation)) {
        slotKeys.forEach((slotKey) => {
          const slotEnd = `${String(Number(slotKey.slice(0, 2)) + 1).padStart(2, '0')}:00`
          const reservationStart = spansMultipleDays ? STANDARD_DAY_START : reservation.startTime
          const reservationEnd = spansMultipleDays ? STANDARD_DAY_END : reservation.endTime
          if (
            overlapsDateTimes(
              dayKey,
              reservationStart,
              dayKey,
              reservationEnd,
              dayKey,
              slotKey,
              dayKey,
              slotEnd
            )
          ) {
            pushPlate(dayKey, slotKey, String(reservation.assignedVehiclePlate || ''))
          }
        })
      }
    })

    assignmentRows.forEach((row) => {
      const plate = String(row.plate || '').trim()
      if (!plate) return
      for (const dayKey of getCommercialReservationDayKeys({
        date: String(row.date || '').trim(),
        endDate: String(row.endDate || row.date || '').trim(),
      })) {
        slotKeys.forEach((slotKey) => {
          const slotEnd = `${String(Number(slotKey.slice(0, 2)) + 1).padStart(2, '0')}:00`
          if (
            overlapsDateTimes(
              dayKey,
              String(row.startTime || STANDARD_DAY_START).trim(),
              dayKey,
              String(row.endTime || STANDARD_DAY_END).trim(),
              dayKey,
              slotKey,
              dayKey,
              slotEnd
            )
          ) {
            pushPlate(dayKey, slotKey, plate)
          }
        })
      }
    })

    return map
  }, [assignmentRows, reservations, slotKeys])

  const freeCapacityRatioByDay = useMemo(() => {
    const map = new Map<string, number>()
    const totalVehicles = commercialFleet.length
    const totalVehicleSlots = Math.max(totalVehicles * slotKeys.length, 1)

    const allDayKeys = new Set<string>()
    reservations.forEach((reservation) => {
      getCommercialReservationDayKeys(reservation).forEach((dayKey) => allDayKeys.add(dayKey))
    })
    assignmentRows.forEach((row) => {
      getCommercialReservationDayKeys({
        date: String(row.date || '').trim(),
        endDate: String(row.endDate || row.date || '').trim(),
      }).forEach((dayKey) => allDayKeys.add(dayKey))
    })

    allDayKeys.forEach((dayKey) => {
      let occupiedVehicleSlots = 0
      slotKeys.forEach((slotKey) => {
        const occupied = occupiedPlatesByDayAndSlot.get(dayKey)?.get(slotKey)?.size || 0
        occupiedVehicleSlots += occupied
      })
      const freeVehicleSlots = Math.max(totalVehicleSlots - occupiedVehicleSlots, 0)
      map.set(dayKey, freeVehicleSlots / totalVehicleSlots)
    })

    return map
  }, [assignmentRows, commercialFleet.length, occupiedPlatesByDayAndSlot, reservations, slotKeys])

  const myReservations = useMemo(
    () => reservations.filter((reservation) => reservation.requesterId === user.id),
    [reservations, user.id]
  )

  const requestStatusFilter = requestFilters.status ?? '__all__'
  const filteredMyReservations = useMemo(
    () =>
      myReservations.filter((reservation) => {
        const reservationEndDate = getCommercialReservationEndDate(reservation)
        if (requestFilters.start && reservationEndDate < requestFilters.start) return false
        if (requestFilters.end && reservation.date > requestFilters.end) return false
        if (requestStatusFilter !== '__all__' && reservation.status !== requestStatusFilter) return false
        return true
      }),
    [myReservations, requestFilters.end, requestFilters.start, requestStatusFilter]
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
        const reservationEndDate = getCommercialReservationEndDate(reservation)
        if (filters.start && reservationEndDate < filters.start) return false
        if (filters.end && reservation.date > filters.end) return false
        if (statusFilter !== '__all__' && reservation.status !== statusFilter) return false
        return true
      }),
    [filters.end, filters.start, reservations, statusFilter]
  )

  const availableVehiclesForReservation = (target: CommercialReservation) => {
    const targetEndDate = getCommercialReservationEndDate(target)
    return commercialFleet.filter((vehicle) => {
      if (vehicle.available === false) return false

      const plateKey = String(vehicle.plate || '').trim().toUpperCase()
      const hasAssignmentConflict = assignmentRows.some(
        (row) =>
          String(row.plate || '').trim().toUpperCase() === plateKey &&
          overlapsDateTimes(
            String(row.date || '').trim(),
            String(row.startTime || '').trim(),
            String(row.endDate || row.date || '').trim(),
            String(row.endTime || row.startTime || '').trim(),
            target.date,
            target.startTime,
            targetEndDate,
            target.endTime
          )
      )
      if (hasAssignmentConflict) return false

      return !confirmedReservations.some(
        (reservation) =>
          reservation.id !== target.id &&
          reservation.assignedVehicleId === vehicle.id &&
          overlapsDateTimes(
            reservation.date,
            reservation.startTime,
            getCommercialReservationEndDate(reservation),
            reservation.endTime,
            target.date,
            target.startTime,
            targetEndDate,
            target.endTime
          )
      )
    })
  }

  const handleOpenReservation = (dayIso: string) => {
    if (dayIso < todayIso) return
    setSelectedDay(dayIso)
    setSelectedEndDay(dayIso)
    setDialogOpen(true)
  }

  const resetForm = () => {
    const today = isoDate(new Date())
    setSelectedDay(today)
    setSelectedEndDay(today)
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
    if (selectedEndDay < selectedDay) {
      setError('La data final no pot ser anterior a la inicial')
      return
    }
    const isMultiDayReservation = selectedEndDay !== selectedDay
    const effectiveStartTime = isMultiDayReservation ? STANDARD_DAY_START : startTime
    const effectiveEndTime = isMultiDayReservation ? STANDARD_DAY_END : endTime

    try {
      setSaving(true)
      const res = await fetch('/api/logistica/reserva-comercials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDay,
          endDate: selectedEndDay,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
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
  const isMultiDaySelection = selectedEndDay !== selectedDay
  const selectedDayTimeline = useMemo(() => {
    const totalVehicles = commercialFleet.length
    return slotKeys.map((slotStart) => {
      const slotEnd = `${String(Number(slotStart.slice(0, 2)) + 1).padStart(2, '0')}:00`
      const occupiedVehicles =
        occupiedPlatesByDayAndSlot.get(selectedDay)?.get(slotStart)?.size || 0
      const freeVehicles = Math.max(totalVehicles - occupiedVehicles, 0)

      return {
        slotStart,
        slotEnd,
        occupiedVehicles,
        freeVehicles,
        totalVehicles,
      }
    })
  }, [commercialFleet.length, occupiedPlatesByDayAndSlot, selectedDay, slotKeys])

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
                    const freeCapacityRatio = freeCapacityRatioByDay.get(dayIso) ?? 1
                    const availabilityVisual = dayAvailabilityVisual(freeCapacityRatio)
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
                              : availabilityVisual.tone
                            : 'border-gray-100 bg-gray-50 text-gray-400'
                        )}
                      >
                        <div className="text-sm font-semibold">{day.getDate()}</div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {!isPastDay && dayReservations.length > 0 ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                              Amb reserva
                            </span>
                          ) : null}
                          {!isPastDay && dayAssignments.length > 0 ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                              Amb lliurament
                            </span>
                          ) : null}
                        </div>

                        {!isPastDay && dayReservations.length > 0 ? (
                          <div className="mt-2 space-y-1.5">
                            {dayReservations.slice(0, 1).map((reservation) => {
                              const isPending = reservation.status === 'pending'
                              const isMultiDayReservation =
                                getCommercialReservationEndDate(reservation) !== reservation.date
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
                                      {isMultiDayReservation ? 'Tot el dia' : `${reservation.startTime} - ${reservation.endTime}`}
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
                            {false ? (
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
                            {false ? (
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

                  <div className="mt-3 flex items-center justify-end">
                    <Badge variant="outline" className="px-3 py-1 text-sm">
                      {filteredMyReservations.length} resultat{filteredMyReservations.length === 1 ? '' : 's'}
                    </Badge>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                      <SmartFilters
                        modeDefault="week"
                        modeOptions={['week', 'month', 'year', 'day', 'range']}
                        role="Treballador"
                        showDepartment={false}
                        showWorker={false}
                        showLocation={false}
                        showStatus={false}
                        onChange={handleRequestDatesChange}
                        initialStart={requestFilters.start}
                        initialEnd={requestFilters.end}
                      />

                      <div className="flex flex-nowrap gap-2 lg:ml-auto">
                        {[
                          { value: '__all__', label: 'Totes' },
                          { value: 'pending', label: 'Pendents' },
                          { value: 'confirmed', label: 'Confirmades' },
                          { value: 'cancelled', label: 'Cancel·lades' },
                          { value: 'rejected', label: 'Rebutjades' },
                        ].map((option) => {
                          const active = (requestFilters.status ?? '__all__') === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() =>
                                setRequestFilters((prev) => ({
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

                  <div className="mt-4 space-y-3">
                    {loading ? <div className="text-sm text-slate-500">Carregant...</div> : null}
                    {!loading && filteredMyReservations.length === 0 ? (
                      <div className="text-sm text-slate-500">Encara no tens cap sol·licitud.</div>
                    ) : null}

                    {filteredMyReservations.map((reservation) => (
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
                          {reservationDateLabel(reservation)}
                        </div>
                        {getCommercialReservationEndDate(reservation) !== reservation.date ? (
                          <div className="mt-1 text-xs font-medium text-slate-500">
                            Franja completa: {reservationDateLabel(reservation)}
                          </div>
                        ) : null}
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
                                {reservationDateLabel(reservation)}
                              </span>
                              {reservation.assignedVehiclePlate ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                  {reservation.assignedVehiclePlate}
                                </span>
                              ) : null}
                            </div>

                            {getCommercialReservationEndDate(reservation) !== reservation.date ? (
                              <div className="mt-2 text-xs font-medium text-slate-500">
                                Franja completa: {reservationDateLabel(reservation)}
                              </div>
                            ) : null}

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
                                      {vehicle.plate} · {TRANSPORT_TYPE_LABELS[vehicle.type] || vehicle.type}
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
              <Input value={prettyDate(selectedDay)} readOnly />
            </Field>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">
                Disponibilitat 08:00 - 18:00
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Capacitat del dia: {commercialFleet.length} vehicle{commercialFleet.length === 1 ? '' : 's'} x 10 hores
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedDayTimeline.map((slot) => (
                  <div
                    key={`${slot.slotStart}-${slot.slotEnd}`}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm',
                      slot.freeVehicles === 0
                        ? 'border-red-200 bg-red-50 text-red-800'
                        : slot.freeVehicles < slot.totalVehicles
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    )}
                  >
                    <div className="font-semibold">
                      {slot.slotStart} - {slot.slotEnd}
                    </div>
                    <div className="mt-1 text-xs">
                      {slot.freeVehicles}/{slot.totalVehicles} lliures
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Field label="Fins al dia">
              <Input
                type="date"
                min={selectedDay}
                value={selectedEndDay}
                onChange={(event) => setSelectedEndDay(event.target.value)}
              />
            </Field>
            <div className="text-xs text-slate-500">Seleccionat: {prettyDate(selectedEndDay)}</div>
            {isMultiDaySelection ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Reserva multi-dia: es bloquejarà cada dia complet de 08:00 a 18:00.
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hora inici">
                <Input
                  type="time"
                  value={isMultiDaySelection ? STANDARD_DAY_START : startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={isMultiDaySelection}
                />
              </Field>
              <Field label="Hora fi">
                <Input
                  type="time"
                  value={isMultiDaySelection ? STANDARD_DAY_END : endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  disabled={isMultiDaySelection}
                />
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

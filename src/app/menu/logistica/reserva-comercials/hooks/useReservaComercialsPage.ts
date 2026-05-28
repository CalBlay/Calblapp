'use client'

import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { endOfWeek, format, startOfWeek } from 'date-fns'

import type { FiltersState } from '@/components/layout/FiltersBar'
import { useTransports } from '@/hooks/useTransports'
import {
  getCommercialReservationDayKeys,
  getCommercialReservationEndDate,
  type CommercialReservation,
  type CommercialReservationStatus,
} from '@/lib/commercialReservations'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { baseCanValidateReservaComercials } from '@/lib/reservaComercialsPermissions'
import { PERM } from '@/lib/permissionKeys'
import type {
  AssignmentItem,
  AssignmentRow,
  ReservationPageState,
  SessionUser,
  TabId,
} from '../types'
import {
  ensureSetMapValue,
  isoDate,
  monthBounds,
  monthMatrix,
  overlapsDateTimes,
  STANDARD_DAY_END,
  STANDARD_DAY_START,
} from '../utils'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'

type UseReservaComercialsPageResult = ReservationPageState & {
  setTabAndUrl: (nextTab: TabId) => void
  setMonthDate: React.Dispatch<React.SetStateAction<Date>>
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedEndDay: React.Dispatch<React.SetStateAction<string>>
  setStartTime: React.Dispatch<React.SetStateAction<string>>
  setEndTime: React.Dispatch<React.SetStateAction<string>>
  setDestination: React.Dispatch<React.SetStateAction<string>>
  setReason: React.Dispatch<React.SetStateAction<string>>
  setNotes: React.Dispatch<React.SetStateAction<string>>
  setFilters: React.Dispatch<React.SetStateAction<FiltersState>>
  setRequestFilters: React.Dispatch<React.SetStateAction<FiltersState>>
  setSelectedVehicleByReservation: React.Dispatch<React.SetStateAction<Record<string, string>>>
  handleValidationDatesChange: (next: SmartFiltersChange) => void
  handleRequestDatesChange: (next: SmartFiltersChange) => void
  handleOpenReservation: (dayIso: string) => void
  handleSubmit: () => Promise<void>
  handleValidation: (id: string, status: CommercialReservationStatus) => Promise<void>
  handleCancelReservation: (id: string) => Promise<void>
  availableVehiclesForReservation: (target: CommercialReservation) => ReturnType<typeof useTransports>['data']
  reservationsByDay: Map<string, CommercialReservation[]>
  assignmentRowsByDay: Map<string, AssignmentRow[]>
  freeCapacityRatioByDay: Map<string, number>
  pendingReservationsByDay: Map<string, number>
}

const RESERVA_UI_PATH = '/menu/logistica/reserva-comercials'

export function useReservaComercialsPage(): UseReservaComercialsPageResult {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: session } = useSession()
  const user = (session?.user || {}) as SessionUser
  const { uiActions, ready: permsReady } = useUiPermissions()

  const legacyCanValidate = baseCanValidateReservaComercials({
    role: user.role,
    isTransportLead: user.isTransportLead,
  })

  const canRequest = useMemo(() => {
    if (!permsReady) return true
    return uiActions[PERM.action(RESERVA_UI_PATH, 'request')] === true
  }, [permsReady, uiActions])

  const canValidate = useMemo(() => {
    if (!permsReady) return legacyCanValidate
    return uiActions[PERM.action(RESERVA_UI_PATH, 'validate')] === true
  }, [permsReady, uiActions, legacyCanValidate])

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
  const vehicleWeightByPlate = useMemo(() => {
    const map = new Map<string, number>()
    commercialFleet.forEach((vehicle) => {
      const plate = String(vehicle.plate || '').trim().toUpperCase()
      if (!plate) return
      map.set(plate, vehicle.type === 'comercial' ? 1 : 0.4)
    })
    return map
  }, [commercialFleet])

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
          .map(
            (row): AssignmentRow => ({
              id: row.id,
              date: String(row.startDate || item.day || '').trim(),
              endDate: String(row.endDate || row.startDate || item.day || '').trim(),
              startTime: String(row.startTime || item.eventStartTime || '').trim(),
              endTime: String(row.endTime || item.eventEndTime || row.startTime || item.eventStartTime || '').trim(),
              plate: String(row.plate || '').trim(),
              vehicleType: String(row.vehicleType || '').trim(),
              name: String(row.name || '').trim(),
              label: String(item.eventName || '').trim() || 'Assignació',
            })
          )
      )
      .filter((row) => row.date && row.startTime)
  }, [assignmentItems, commercialFleet])

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

  const pendingReservationsByDay = useMemo(() => {
    const map = new Map<string, number>()
    reservations.forEach((reservation) => {
      if (reservation.status !== 'pending') return
      getCommercialReservationDayKeys(reservation).forEach((dayKey) => {
        map.set(dayKey, (map.get(dayKey) || 0) + 1)
      })
    })
    return map
  }, [reservations])

  const assignmentRowsByDay = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>()
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
    const totalWeight = Math.max(
      commercialFleet.reduce((sum, vehicle) => sum + (vehicle.type === 'comercial' ? 1 : 0.4), 0),
      1
    )
    const totalWeightedSlots = totalWeight * slotKeys.length

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
      let occupiedWeightedSlots = 0
      let pendingWeightedSlots = 0
      let hasAnyUsage = false

      slotKeys.forEach((slotKey) => {
        const occupiedPlates = occupiedPlatesByDayAndSlot.get(dayKey)?.get(slotKey) || new Set<string>()
        const occupiedWeight = Array.from(occupiedPlates).reduce(
          (sum, plate) => sum + (vehicleWeightByPlate.get(plate) ?? 1),
          0
        )
        occupiedWeightedSlots += occupiedWeight
        if (occupiedWeight > 0) hasAnyUsage = true

        reservations.forEach((reservation) => {
          if (reservation.status !== 'pending') return
          if (!getCommercialReservationDayKeys(reservation).includes(dayKey)) return

          const slotEnd = `${String(Number(slotKey.slice(0, 2)) + 1).padStart(2, '0')}:00`
          const spansMultipleDays = getCommercialReservationEndDate(reservation) !== reservation.date
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
            pendingWeightedSlots += 0.85
            hasAnyUsage = true
          }
        })
      })

      const freeWeightedSlots = Math.max(totalWeightedSlots - occupiedWeightedSlots - pendingWeightedSlots, 0)
      const rawRatio = freeWeightedSlots / totalWeightedSlots
      const visualRatio = hasAnyUsage ? Math.min(rawRatio, 0.72) : rawRatio
      map.set(dayKey, visualRatio)
    })

    return map
  }, [assignmentRows, commercialFleet, occupiedPlatesByDayAndSlot, reservations, slotKeys, vehicleWeightByPlate])

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
      const occupiedVehicles = occupiedPlatesByDayAndSlot.get(selectedDay)?.get(slotStart)?.size || 0
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

  return {
    tab,
    canRequest,
    canValidate,
    filters,
    requestFilters,
    monthDate,
    monthLabel,
    reservations,
    loading,
    error,
    dialogOpen,
    selectedDay,
    selectedEndDay,
    startTime,
    endTime,
    destination,
    reason,
    notes,
    saving,
    days,
    myReservations,
    filteredMyReservations,
    manageableReservations,
    selectedVehicleByReservation,
    selectedDayTimeline,
    isMultiDaySelection,
    todayIso,
    assignmentItems,
    setTabAndUrl,
    setMonthDate,
    setDialogOpen,
    setSelectedEndDay,
    setStartTime,
    setEndTime,
    setDestination,
    setReason,
    setNotes,
    setFilters,
    setRequestFilters,
    setSelectedVehicleByReservation,
    handleValidationDatesChange,
    handleRequestDatesChange,
    handleOpenReservation,
    handleSubmit,
    handleValidation,
    handleCancelReservation,
    availableVehiclesForReservation,
    reservationsByDay,
    assignmentRowsByDay,
    freeCapacityRatioByDay,
    pendingReservationsByDay,
  }
}

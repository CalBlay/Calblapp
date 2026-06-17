import { formatDateOnly } from '@/lib/date-format'
import {
  getCommercialReservationDayKeys,
  getCommercialReservationEndDate,
  type CommercialReservation,
} from '@/lib/commercialReservations'
import { TRANSPORT_TYPE_LABELS } from '@/lib/transportTypes'

export type KeysHandoverRow = {
  id: string
  date: string
  plate: string
  personName: string
  startTime: string
  endTime: string
  destination: string
  source: 'commercialReservation' | 'quadrant'
  sourceLabel: string
  missingPlate?: boolean
}

export type AssignmentRowForKeys = {
  id: string
  date?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  plate?: string
  name?: string
  label?: string
  department?: string
  location?: string
  vehicleType?: string
}

export const STANDARD_DAY_START = '08:00'
export const STANDARD_DAY_END = '18:00'
export const STANDARD_DAY_MINUTES = 10 * 60

export function monthMatrix(baseDate: Date) {
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

export function isoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function prettyDate(value: string) {
  return formatDateOnly(value, value)
}

export function monthBounds(baseDate: Date) {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
  return {
    start: isoDate(start),
    end: isoDate(end),
  }
}

export function reservationDateLabel(
  reservation: Pick<CommercialReservation, 'date' | 'endDate' | 'startTime' | 'endTime'>
) {
  const endDate = getCommercialReservationEndDate(reservation)
  if (endDate !== reservation.date) {
    return `${prettyDate(reservation.date)} ${reservation.startTime} -> ${prettyDate(endDate)} ${reservation.endTime}`
  }
  return `${prettyDate(reservation.date)} · ${reservation.startTime} - ${reservation.endTime}`
}

export function overlapsDateTimes(
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

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part))
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function dayAvailabilityVisual(freeRatio: number) {
  const ratio = clamp(freeRatio, 0, 1)
  if (ratio <= 0.15) {
    return {
      tone: 'border-red-300 bg-red-100 hover:border-red-400 hover:bg-red-100',
    }
  }
  if (ratio <= 0.45) {
    return {
      tone: 'border-amber-300 bg-amber-100 hover:border-amber-400 hover:bg-amber-100',
    }
  }
  if (ratio <= 0.75) {
    return {
      tone: 'border-lime-300 bg-lime-100 hover:border-lime-400 hover:bg-lime-100',
    }
  }
  return {
    tone: 'border-emerald-300 bg-emerald-100 hover:border-emerald-400 hover:bg-emerald-100',
  }
}

export function ensureSetMapValue(map: Map<string, Set<string>>, key: string) {
  const current = map.get(key) || new Set<string>()
  map.set(key, current)
  return current
}

function effectiveTimesForDay(
  dayKey: string,
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string
) {
  const spansMultipleDays = endDate !== startDate
  if (!spansMultipleDays) {
    return {
      startTime: startTime || STANDARD_DAY_START,
      endTime: endTime || STANDARD_DAY_END,
    }
  }
  if (dayKey === startDate && dayKey === endDate) {
    return {
      startTime: startTime || STANDARD_DAY_START,
      endTime: endTime || STANDARD_DAY_END,
    }
  }
  if (dayKey === startDate) {
    return {
      startTime: startTime || STANDARD_DAY_START,
      endTime: STANDARD_DAY_END,
    }
  }
  if (dayKey === endDate) {
    return {
      startTime: STANDARD_DAY_START,
      endTime: endTime || STANDARD_DAY_END,
    }
  }
  return {
    startTime: STANDARD_DAY_START,
    endTime: STANDARD_DAY_END,
  }
}

export function buildKeysHandoverRowsForDay({
  dayKey,
  reservations,
  assignmentRows,
}: {
  dayKey: string
  reservations: CommercialReservation[]
  assignmentRows: AssignmentRowForKeys[]
}) {
  const withPlate: KeysHandoverRow[] = []
  const withoutPlate: KeysHandoverRow[] = []

  for (const reservation of reservations) {
    if (reservation.status !== 'confirmed' && reservation.status !== 'pending') continue
    if (!getCommercialReservationDayKeys(reservation).includes(dayKey)) continue

    const endDate = getCommercialReservationEndDate(reservation)
    const { startTime, endTime } = effectiveTimesForDay(
      dayKey,
      reservation.date,
      endDate,
      reservation.startTime,
      reservation.endTime
    )
    const plate = String(reservation.assignedVehiclePlate || '').trim().toUpperCase()
    const row: KeysHandoverRow = {
      id: `reservation:${reservation.id}`,
      date: dayKey,
      plate: plate || '—',
      personName: String(reservation.requesterName || '').trim() || '—',
      startTime,
      endTime,
      destination: String(reservation.destination || '').trim() || '—',
      source: 'commercialReservation',
      sourceLabel:
        reservation.status === 'pending' ? 'Reserva (pendent)' : 'Reserva comercial',
      missingPlate: !plate,
    }

    if (plate) withPlate.push(row)
    else withoutPlate.push(row)
  }

  for (const assignment of assignmentRows) {
    const startDate = String(assignment.date || assignment.startDate || '').trim()
    const endDate = String(assignment.endDate || startDate).trim()
    if (!startDate || !getCommercialReservationDayKeys({ date: startDate, endDate }).includes(dayKey)) {
      continue
    }

    const plate = String(assignment.plate || '').trim().toUpperCase()
    if (!plate) continue

    const { startTime, endTime } = effectiveTimesForDay(
      dayKey,
      startDate,
      endDate,
      String(assignment.startTime || '').trim(),
      String(assignment.endTime || '').trim()
    )

    const eventName = String(assignment.label || '').trim()
    const department = String(assignment.department || '').trim()
    const departmentLabel = department
      ? department.charAt(0).toUpperCase() + department.slice(1)
      : 'Esdeveniment'
    const vehicleLabel =
      TRANSPORT_TYPE_LABELS[String(assignment.vehicleType || '').trim()] ||
      String(assignment.vehicleType || '').trim()

    withPlate.push({
      id: `assignment:${assignment.id}:${dayKey}`,
      date: dayKey,
      plate,
      personName: String(assignment.name || '').trim() || '—',
      startTime,
      endTime,
      destination: String(assignment.location || eventName || '').trim() || '—',
      source: 'quadrant',
      sourceLabel: eventName
        ? `${eventName} · ${departmentLabel}${vehicleLabel ? ` · ${vehicleLabel}` : ''}`
        : `Esdeveniment · ${departmentLabel}${vehicleLabel ? ` · ${vehicleLabel}` : ''}`,
    })
  }

  const sortRows = (rows: KeysHandoverRow[]) =>
    [...rows].sort(
      (a, b) =>
        a.startTime.localeCompare(b.startTime) ||
        a.plate.localeCompare(b.plate) ||
        a.personName.localeCompare(b.personName)
    )

  return {
    withPlate: sortRows(withPlate),
    withoutPlate: sortRows(withoutPlate),
  }
}

function enumerateDayKeys(start: string, end: string) {
  const days: string[] = []
  const cursor = new Date(`${start}T12:00:00`)
  const limit = new Date(`${end}T12:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(limit.getTime()) || limit < cursor) {
    return start ? [start] : []
  }
  while (cursor <= limit) {
    days.push(isoDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

export function buildKeysHandoverRowsForRange({
  start,
  end,
  reservations,
  assignmentRows,
}: {
  start: string
  end: string
  reservations: CommercialReservation[]
  assignmentRows: AssignmentRowForKeys[]
}) {
  const withPlate: KeysHandoverRow[] = []
  const withoutPlate: KeysHandoverRow[] = []

  for (const dayKey of enumerateDayKeys(start, end)) {
    const dayRows = buildKeysHandoverRowsForDay({
      dayKey,
      reservations,
      assignmentRows,
    })
    withPlate.push(...dayRows.withPlate)
    withoutPlate.push(...dayRows.withoutPlate)
  }

  const sortRows = (rows: KeysHandoverRow[]) =>
    [...rows].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.plate.localeCompare(b.plate) ||
        a.personName.localeCompare(b.personName)
    )

  return {
    withPlate: sortRows(withPlate),
    withoutPlate: sortRows(withoutPlate),
  }
}

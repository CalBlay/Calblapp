import { formatDateOnly } from '@/lib/date-format'
import { getCommercialReservationEndDate, type CommercialReservation } from '@/lib/commercialReservations'

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

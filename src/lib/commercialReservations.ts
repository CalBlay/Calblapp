export type CommercialReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'rejected'

export interface CommercialReservation {
  id: string
  requesterId: string
  requesterName: string
  requesterRole?: string
  requesterDepartment?: string
  date: string
  endDate?: string | null
  startTime: string
  endTime: string
  destination: string
  reason: string
  notes: string
  status: CommercialReservationStatus
  assignedVehicleId?: string | null
  assignedVehiclePlate?: string | null
  approvedById?: string | null
  approvedByName?: string | null
  createdAt: string
  updatedAt?: string | null
}

export const COMMERCIAL_RESERVATIONS_COLLECTION = 'commercialVehicleReservations'

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`)
}

export function getCommercialReservationEndDate(reservation: Pick<CommercialReservation, 'date' | 'endDate'>) {
  return String(reservation.endDate || '').trim() || reservation.date
}

export function getCommercialReservationDayKeys(
  reservation: Pick<CommercialReservation, 'date' | 'endDate'>
) {
  const start = String(reservation.date || '').trim()
  const end = getCommercialReservationEndDate(reservation)
  if (!start || !end) return []

  const startDate = toUtcDate(start)
  const endDate = toUtcDate(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
    return [start]
  }

  const days: string[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

export const COMMERCIAL_RESERVATION_STATUS_LABELS: Record<
  CommercialReservationStatus,
  string
> = {
  pending: 'Pendent',
  confirmed: 'Confirmada',
  cancelled: 'Cancel·lada',
  rejected: 'Rebutjada',
}

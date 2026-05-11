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

export const COMMERCIAL_RESERVATION_STATUS_LABELS: Record<
  CommercialReservationStatus,
  string
> = {
  pending: 'Pendent',
  confirmed: 'Confirmada',
  cancelled: 'Cancel·lada',
  rejected: 'Rebutjada',
}

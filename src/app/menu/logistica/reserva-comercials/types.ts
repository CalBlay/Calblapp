import type { FiltersState } from '@/components/layout/FiltersBar'
import type { CommercialReservation, CommercialReservationStatus } from '@/lib/commercialReservations'
import type { KeysHandoverRow } from './utils'

export type TabId = 'sollicitud' | 'validacio' | 'claus'

export type SessionUser = {
  id?: string
  role?: string | null
  name?: string | null
  department?: string | null
  isTransportLead?: boolean | null
}

export type AssignmentRow = {
  id: string
  date?: string
  plate?: string
  vehicleType?: string
  name?: string
  label?: string
  department?: string
  location?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
}

export type AssignmentItem = {
  eventCode: string
  day: string
  eventStartTime: string
  eventEndTime?: string
  eventName: string
  location: string
  source?: 'quadrant' | 'commercialReservation'
  rows?: AssignmentRow[]
}

export type ReservationTimelineSlot = {
  slotStart: string
  slotEnd: string
  occupiedVehicles: number
  freeVehicles: number
  totalVehicles: number
}

export type ReservationPageState = {
  tab: TabId
  canRequest: boolean
  canValidate: boolean
  canKeys: boolean
  filters: FiltersState
  requestFilters: FiltersState
  monthDate: Date
  monthLabel: string
  reservations: CommercialReservation[]
  loading: boolean
  error: string | null
  dialogOpen: boolean
  selectedDay: string
  selectedEndDay: string
  startTime: string
  endTime: string
  destination: string
  reason: string
  notes: string
  saving: boolean
  days: Date[]
  myReservations: CommercialReservation[]
  manageableReservations: CommercialReservation[]
  filteredMyReservations: CommercialReservation[]
  selectedVehicleByReservation: Record<string, string>
  selectedDayTimeline: ReservationTimelineSlot[]
  isMultiDaySelection: boolean
  todayIso: string
  assignmentItems: AssignmentItem[]
  pendingReservationsByDay: Map<string, number>
  keysFilters: FiltersState
  keysHandoverWithPlate: KeysHandoverRow[]
  keysHandoverWithoutPlate: KeysHandoverRow[]
  keysLoading: boolean
  keysShowsDateColumn: boolean
  totalFleetVehicles: number
}

export type ValidationAction = (id: string, status: CommercialReservationStatus) => Promise<void>

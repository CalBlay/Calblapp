import type { StatusHistoryEntry } from '@/lib/maintenanceJourneyStatus'

export type MaintenanceStatus =
  | 'nou'
  | 'assignat'
  | 'en_curs'
  | 'espera'
  | 'fet'
  | 'no_fet'
  | 'validat'

export type JourneyDateMode = 'day' | 'week' | 'month'

export type JourneyDateFilters = {
  start: string
  end: string
  mode: JourneyDateMode
}

export type PreventiuPlannedItem = {
  id: string
  kind: 'preventiu'
  title: string
  date: string
  startTime: string
  endTime: string
  location?: string
  worker?: string
  machine?: string
  vehicleId?: string | null
  vehiclePlate?: string | null
  hasMedia?: boolean
  templateId?: string | null
  lastRecordId?: string | null
  lastStatus?: string | null
  lastProgress?: number | null
}

export type TicketJourneyItem = {
  id: string
  kind: 'ticket'
  title: string
  code?: string
  status?: MaintenanceStatus
  ticketType?: 'maquinaria' | 'deco'
  date: string
  startTime: string
  endTime: string
  location?: string
  worker?: string
  machine?: string
  vehicleId?: string | null
  vehiclePlate?: string | null
  hasMedia?: boolean
  templateId?: string
}

export type WorkItem = PreventiuPlannedItem | TicketJourneyItem

export type JourneyTicket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  location?: string
  workLocation?: string | null
  machine?: string
  description?: string
  createdByName?: string | null
  workerName?: string | null
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  status: MaintenanceStatus
  assignedToNames?: string[]
  vehicleId?: string | null
  vehiclePlate?: string | null
  statusHistory?: StatusHistoryEntry[]
  imageUrl?: string | null
  imageUrls?: string[] | null
  completionAttachments?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string; name?: string } | null
  }> | null
}

export type WorkExportRow = {
  Data: string
  Tipus: string
  Codi: string
  Titol: string
  HoraInici: string
  HoraFi: string
  Ubicacio: string
  Operari: string
  Estat: string
  Progres: string
}

export type TicketStatus = 'nou' | 'assignat' | 'en_curs' | 'espera' | 'fet' | 'no_fet' | 'validat' | 'resolut'
export type TicketPriority = 'urgent' | 'alta' | 'normal' | 'baixa'
export type TicketType = 'maquinaria' | 'deco'

export type Ticket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  location: string
  machine: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  ticketType?: TicketType
  source?: 'manual' | 'incidencia' | 'whatsblapp'
  sourceChannelId?: string | null
  sourceMessageId?: string | null
  sourceMessageText?: string | null
  sourceEventId?: string | null
  sourceEventCode?: string | null
  sourceEventTitle?: string | null
  sourceEventLocation?: string | null
  sourceEventDate?: string | null
  createdAt: number | string
  createdById?: string
  createdByName?: string
  assignedToIds?: string[]
  assignedToNames?: string[]
  assignedAt?: number | null
  assignedByName?: string | null
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
  imageUrl?: string | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
  needsVehicle?: boolean
  vehiclePlate?: string | null
  externalized?: boolean
  supplierName?: string | null
  supplierEmail?: string | null
  externalReference?: string | null
  externalStatus?: 'sent' | 'resent' | 'answered' | 'closed' | null
  externalSentAt?: number | string | null
  externalSentById?: string | null
  externalSentByName?: string | null
  externalizationHistory?: Array<{
    at: number
    byId?: string
    byName?: string
    supplierName?: string | null
    supplierEmail?: string | null
    reference?: string | null
    subject?: string | null
    message?: string | null
    attachmentNames?: string[]
    status?: 'sent' | 'resent'
  }>
  statusHistory?: Array<{
    status: TicketStatus
    at: number
    byName?: string
    startTime?: string | null
    endTime?: string | null
    note?: string | null
  }>
}

export type UserItem = {
  id: string
  name: string
  department?: string
  departmentLower?: string
  role?: string
}

export type MachineItem = {
  code: string
  name: string
  label: string
}

export type TransportItem = {
  id: string
  type?: string
  plate?: string
}

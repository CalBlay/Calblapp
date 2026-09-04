export type TicketStatus =
  | 'nou'
  | 'assignat'
  | 'reassignat'
  | 'en_curs'
  | 'espera'
  | 'fet'
  | 'no_fet'
  | 'validat'
export type TicketPriority = 'urgent' | 'alta' | 'normal' | 'baixa'
export type TicketType = 'maquinaria' | 'deco'
export type TicketIntakeChannel =
  | 'restaurant'
  | 'finca'
  | 'incidencia'
  | 'ops'
  | 'manual_tickets'
  | 'manual_cuina_central'
  | 'other'
export type TicketWorkflowStage =
  | 'tickets_inbox'
  | 'planner_queue'
  | 'planned_internal'
  | 'externalized'
  | 'resolved_admin'
  | 'resolved_planner'
  | 'closed'
export type TicketResolutionArea = 'administracio' | 'manteniment' | 'tecnic' | 'proveidor'

export type Ticket = {
  id: string
  ticketCode?: string | null
  incidentNumber?: string | null
  center?: string | null
  location: string
  workLocation?: string | null
  zone?: string | null
  machine: string
  description: string
  operatorTitle?: string | null
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
  /** Nom real del treballador quan el compte de sessió és genèric (restaurants). */
  workerName?: string | null
  assignedToIds?: string[]
  assignedToNames?: string[]
  assignedAt?: number | null
  assignedByName?: string | null
  plannedStart?: number | null
  plannedEnd?: number | null
  estimatedMinutes?: number | null
  imageUrl?: string | null
  imageUrls?: string[] | null
  completionAttachments?: Array<{
    url?: string | null
    path?: string | null
    meta?: { size?: number; type?: string; name?: string } | null
  }> | null
  imagePath?: string | null
  imageMeta?: { size?: number; type?: string } | null
  needsVehicle?: boolean
  vehicleType?: string | null
  vehiclePlate?: string | null
  externalized?: boolean
  supplierName?: string | null
  supplierEmail?: string | null
  externalReference?: string | null
  externalStatus?: 'sent' | 'resent' | 'answered' | 'closed' | null
  intakeChannel?: TicketIntakeChannel | null
  workflowStage?: TicketWorkflowStage | null
  opsChannelId?: string | null
  opsManagerUserId?: string | null
  resolutionCategory?: string | null
  resolutionNote?: string | null
  resolvedByArea?: TicketResolutionArea | null
  resolvedAt?: number | string | null
  resolvedById?: string | null
  resolvedByName?: string | null
  requiresCreatorValidation?: boolean | null
  creatorValidatedAt?: number | string | null
  creatorValidatedById?: string | null
  creatorValidatedByName?: string | null
  creatorRejectedAt?: number | string | null
  creatorRejectedById?: string | null
  creatorRejectedByName?: string | null
  creatorRejectionNote?: string | null
  capValidatedAt?: number | string | null
  capValidatedById?: string | null
  capValidatedByName?: string | null
  externalSentAt?: number | string | null
  externalSentById?: string | null
  externalSentByName?: string | null
  supplierResolvedAt?: number | string | null
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
  planningHistory?: Array<{
    action: 'planificat' | 'replanificat' | 'desplanificat'
    at: number
    byName?: string
    plannedStart?: number | null
    plannedEnd?: number | null
    previousPlannedStart?: number | null
    previousPlannedEnd?: number | null
    assignedToNames?: string[]
    note?: string | null
  }>
  statusHistory?: Array<{
    status: TicketStatus
    at: number
    byName?: string
    startTime?: string | null
    endTime?: string | null
    note?: string | null
  }>
  workLogs?: Array<{
    at: number
    byId?: string | null
    byName?: string | null
    startTime?: string | null
    endTime?: string | null
    note?: string | null
    sourceStatus?: string | null
    closedByStatus?: string | null
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
  center?: string
  location?: string
  zone?: string
}

export type TransportItem = {
  id: string
  type?: string
  plate?: string
}

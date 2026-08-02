import { normalizeTicketWorkflowStage } from '@/lib/maintenanceTicketAlerts'

const normalizeStatus = (value?: string | null) => {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut') return 'fet'
  if (v === 'validat') return 'validat'
  return 'nou'
}

const hasPlanningSlot = (value?: number | string | null) =>
  value != null && String(value).trim() !== ''

export type MaintenanceTicketDeleteSnapshot = {
  status?: string | null
  workflowStage?: string | null
  assignedToIds?: string[] | null
  plannedStart?: number | string | null
  plannedEnd?: number | string | null
  externalized?: boolean
}

/** Ticket tancat per manteniment o administracio. */
export function isMaintenanceTicketResolved(ticket: MaintenanceTicketDeleteSnapshot): boolean {
  const status = normalizeStatus(ticket.status)
  if (['validat', 'fet', 'no_fet'].includes(status)) return true

  const stage = normalizeTicketWorkflowStage(ticket.workflowStage)
  return stage === 'resolved_admin' || stage === 'resolved_planner' || stage === 'closed'
}

/** Ticket ja assignat, amb franja o enviat a proveidor. */
export function isMaintenanceTicketPlanned(ticket: MaintenanceTicketDeleteSnapshot): boolean {
  if (ticket.externalized) return true

  const stage = normalizeTicketWorkflowStage(ticket.workflowStage)
  if (stage === 'planned_internal' || stage === 'externalized') return true

  const assignedIds = Array.isArray(ticket.assignedToIds) ? ticket.assignedToIds : []
  if (assignedIds.length > 0) return true

  if (hasPlanningSlot(ticket.plannedStart) && hasPlanningSlot(ticket.plannedEnd)) return true

  return false
}

/** El creador pot eliminar mentre el ticket encara no s'ha tancat ni planificat. */
export function canCreatorDeleteMaintenanceTicket(ticket: MaintenanceTicketDeleteSnapshot): boolean {
  return !isMaintenanceTicketResolved(ticket) && !isMaintenanceTicketPlanned(ticket)
}

export function canUserDeleteMaintenanceTicket(
  ticket: MaintenanceTicketDeleteSnapshot & { createdById?: string | null },
  userId?: string | null
): boolean {
  const creatorId = String(ticket.createdById || '').trim()
  const actorId = String(userId || '').trim()
  if (!creatorId || !actorId || creatorId !== actorId) return false
  return canCreatorDeleteMaintenanceTicket(ticket)
}

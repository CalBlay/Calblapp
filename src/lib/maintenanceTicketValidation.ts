import { normalizeTicketWorkflowStage } from '@/lib/maintenanceTicketAlerts'

const normalizeStatus = (value?: string | null) => {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'fet') return 'fet'
  if (v === 'resolut') return 'fet'
  if (v === 'validat') return 'validat'
  return v || 'nou'
}

export type MaintenanceTicketValidationSnapshot = {
  status?: string | null
  workflowStage?: string | null
  resolvedByArea?: string | null
  requiresCreatorValidation?: boolean | null
  creatorValidatedAt?: number | string | null
  capValidatedAt?: number | string | null
  createdById?: string | null
}

export function isGestorResolvedMaintenanceTicket(ticket: {
  workflowStage?: string | null
  resolvedByArea?: string | null
}): boolean {
  const stage = normalizeTicketWorkflowStage(ticket.workflowStage)
  if (stage === 'resolved_admin') return true
  return String(ticket.resolvedByArea || '').trim().toLowerCase() === 'administracio'
}

export function maintenanceTicketRequiresCreatorValidation(
  ticket: MaintenanceTicketValidationSnapshot
): boolean {
  if (ticket.requiresCreatorValidation === true) return true
  return isGestorResolvedMaintenanceTicket(ticket)
}

export function isMaintenanceTicketPendingValidation(ticket: MaintenanceTicketValidationSnapshot): boolean {
  const status = normalizeStatus(ticket.status)
  return status === 'fet'
}

export function canCreatorValidateMaintenanceTicket(
  ticket: MaintenanceTicketValidationSnapshot,
  userId?: string | null
): boolean {
  const actorId = String(userId || '').trim()
  const creatorId = String(ticket.createdById || '').trim()
  if (!actorId || !creatorId || actorId !== creatorId) return false
  if (!maintenanceTicketRequiresCreatorValidation(ticket)) return false
  if (normalizeStatus(ticket.status) === 'validat') return false
  if (!isMaintenanceTicketPendingValidation(ticket)) return false
  return !ticket.creatorValidatedAt
}

export function canCapValidateMaintenanceTicket(
  ticket: MaintenanceTicketValidationSnapshot,
  params: { role: string; isMaintenanceCap: boolean }
): boolean {
  if (!(params.role === 'admin' || params.isMaintenanceCap)) return false
  if (normalizeStatus(ticket.status) === 'validat') return false
  if (!isMaintenanceTicketPendingValidation(ticket)) return false

  if (maintenanceTicketRequiresCreatorValidation(ticket)) {
    return !ticket.capValidatedAt
  }

  return true
}

export function isMaintenanceTicketDualValidationComplete(ticket: MaintenanceTicketValidationSnapshot): boolean {
  if (!maintenanceTicketRequiresCreatorValidation(ticket)) return false
  return Boolean(ticket.creatorValidatedAt) && Boolean(ticket.capValidatedAt)
}

export function getMaintenanceTicketValidationSummary(ticket: MaintenanceTicketValidationSnapshot) {
  const requiresCreator = maintenanceTicketRequiresCreatorValidation(ticket)
  const creatorDone = Boolean(ticket.creatorValidatedAt)
  const capDone = Boolean(ticket.capValidatedAt)

  if (!requiresCreator) {
    return {
      requiresCreatorValidation: false,
      creatorDone: false,
      capDone,
      pendingCreator: false,
      pendingCap: !capDone && isMaintenanceTicketPendingValidation(ticket),
    }
  }

  return {
    requiresCreatorValidation: true,
    creatorDone,
    capDone,
    pendingCreator: !creatorDone && isMaintenanceTicketPendingValidation(ticket),
    pendingCap: !capDone && isMaintenanceTicketPendingValidation(ticket),
  }
}

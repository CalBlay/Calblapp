import { normalizeTicketWorkflowStage } from '@/lib/maintenanceTicketAlerts'

export const CREATOR_REOPEN_WINDOW_DAYS = 7
export const CREATOR_REOPEN_WINDOW_MS = CREATOR_REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000

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
  resolvedAt?: number | string | null
  statusHistory?: Array<{ status?: string | null; at?: number | string | null }> | null
  createdById?: string | null
}

const validationTimestamp = (ticket: MaintenanceTicketValidationSnapshot): number | null => {
  const directCandidates = [ticket.capValidatedAt, ticket.creatorValidatedAt, ticket.resolvedAt]
    .map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value
      if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value).getTime()
        return Number.isNaN(parsed) ? null : parsed
      }
      return null
    })
    .filter((value): value is number => value !== null)

  const historyCandidates = (ticket.statusHistory || [])
    .filter((entry) => normalizeStatus(entry.status) === 'validat')
    .map((entry) => {
      if (typeof entry.at === 'number' && Number.isFinite(entry.at)) return entry.at
      if (typeof entry.at === 'string' && entry.at.trim()) {
        const parsed = new Date(entry.at).getTime()
        return Number.isNaN(parsed) ? null : parsed
      }
      return null
    })
    .filter((value): value is number => value !== null)

  const candidates = [...directCandidates, ...historyCandidates]
  return candidates.length ? Math.max(...candidates) : null
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
  _ticket: MaintenanceTicketValidationSnapshot
): boolean {
  // El ticket ja queda com a fet. La resposta posterior del creador és
  // una confirmació opcional o una petició de reobertura.
  return false
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
  if (normalizeStatus(ticket.status) === 'validat') return false
  if (!isMaintenanceTicketPendingValidation(ticket)) return false
  return !ticket.creatorValidatedAt
}

/**
 * The creator keeps the final say even after Maintenance has validated the
 * resolution. This lets an external centre reopen work that is not actually
 * correct on site.
 */
export function canCreatorRejectMaintenanceTicket(
  ticket: MaintenanceTicketValidationSnapshot,
  userId?: string | null,
  nowMs = Date.now()
): boolean {
  const actorId = String(userId || '').trim()
  const creatorId = String(ticket.createdById || '').trim()
  if (!actorId || !creatorId || actorId !== creatorId) return false

  const status = normalizeStatus(ticket.status)
  if (status === 'fet') return true
  if (status !== 'validat') return false

  const validatedAt = validationTimestamp(ticket)
  if (validatedAt === null || validatedAt > nowMs) return false
  return nowMs - validatedAt <= CREATOR_REOPEN_WINDOW_MS
}

export function canCapValidateMaintenanceTicket(
  ticket: MaintenanceTicketValidationSnapshot,
  params: { role: string; isMaintenanceCap: boolean }
): boolean {
  if (!(params.role === 'admin' || params.isMaintenanceCap)) return false
  if (normalizeStatus(ticket.status) === 'validat') return false
  if (!isMaintenanceTicketPendingValidation(ticket)) return false

  if (maintenanceTicketRequiresCreatorValidation(ticket)) return false

  return true
}

export function isMaintenanceTicketDualValidationComplete(ticket: MaintenanceTicketValidationSnapshot): boolean {
  if (!maintenanceTicketRequiresCreatorValidation(ticket)) return false
  return Boolean(ticket.creatorValidatedAt)
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
    pendingCap: false,
  }
}

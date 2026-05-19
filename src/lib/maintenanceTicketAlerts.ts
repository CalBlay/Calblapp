export const STALE_TICKET_DAYS = 3

const DAY_MS = 1000 * 60 * 60 * 24

export type TicketAlertSnapshot = {
  createdAt?: number | string | null
  updatedAt?: number | string | null
  workflowStage?: string | null
  status?: string | null
  assignedToIds?: string[] | null
  plannedStart?: number | string | null
  plannedEnd?: number | string | null
  externalized?: boolean
  externalStatus?: string | null
  externalSentAt?: number | string | null
  externalizationHistory?: Array<{ at?: number | string | null }> | null
  statusHistory?: Array<{ at?: number | string | null }> | null
}

const toMillis = (value?: number | string | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const normalizeStatus = (value?: string | null) => {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'assignat') return 'assignat'
  if (v === 'en_curs' || v === 'en curs') return 'en_curs'
  if (v === 'espera') return 'espera'
  if (v === 'fet') return 'fet'
  if (v === 'no_fet' || v === 'no fet') return 'no_fet'
  if (v === 'resolut') return 'resolut'
  if (v === 'validat') return 'validat'
  return 'nou'
}

export const normalizeTicketWorkflowStage = (value?: string | null) => {
  const v = String(value || '')
    .trim()
    .toLowerCase()
  if (v === 'planner_queue') return 'planner_queue'
  if (v === 'planned_internal') return 'planned_internal'
  if (v === 'externalized') return 'externalized'
  if (v === 'resolved_admin') return 'resolved_admin'
  if (v === 'resolved_planner') return 'resolved_planner'
  if (v === 'closed') return 'closed'
  return 'tickets_inbox'
}

export function getTicketAgeDays(fromAt?: number | string | null): number {
  const at = toMillis(fromAt)
  if (!at) return 0
  return Math.max(0, Math.floor((Date.now() - at) / DAY_MS))
}

export function isTicketHandled(ticket: TicketAlertSnapshot): boolean {
  if (ticket.externalized) return true

  const status = normalizeStatus(ticket.status)
  if (['validat', 'resolut', 'fet'].includes(status)) return true

  const assignedIds = Array.isArray(ticket.assignedToIds) ? ticket.assignedToIds : []
  if (assignedIds.length > 0) return true

  const plannedStart = ticket.plannedStart
  const plannedEnd = ticket.plannedEnd
  if (plannedStart != null && plannedStart !== '' && plannedEnd != null && plannedEnd !== '') {
    return true
  }

  return false
}

/** Ticket pendent a inbox/planificador amb més de 3 dies sense assignar, planificar ni resoldre. */
export function isTicketStaleAlert(ticket: TicketAlertSnapshot): boolean {
  const stage = normalizeTicketWorkflowStage(ticket.workflowStage)
  if (stage !== 'tickets_inbox' && stage !== 'planner_queue') return false
  if (isTicketHandled(ticket)) return false
  return getTicketAgeDays(ticket.createdAt) >= STALE_TICKET_DAYS
}

/** Ticket enviat a proveidor sense resposta ni seguiment registrat. */
export function isExternalizedAwaitingProvider(ticket: TicketAlertSnapshot): boolean {
  const stage = normalizeTicketWorkflowStage(ticket.workflowStage)
  if (!ticket.externalized && stage !== 'externalized') return false

  const extStatus = String(ticket.externalStatus || 'sent')
    .trim()
    .toLowerCase()
  if (extStatus === 'answered' || extStatus === 'closed') return false

  const status = normalizeStatus(ticket.status)
  if (['validat', 'resolut', 'fet'].includes(status)) return false
  if (stage === 'closed' || stage === 'resolved_planner' || stage === 'resolved_admin') return false

  return true
}

export function getLastExternalFollowUpAt(ticket: TicketAlertSnapshot): number | null {
  const candidates: number[] = []
  const sentAt = toMillis(ticket.externalSentAt)
  if (sentAt) candidates.push(sentAt)

  if (Array.isArray(ticket.externalizationHistory)) {
    for (const entry of ticket.externalizationHistory) {
      const at = toMillis(entry?.at)
      if (at) candidates.push(at)
    }
  }

  if (Array.isArray(ticket.statusHistory)) {
    for (const entry of ticket.statusHistory) {
      const at = toMillis(entry?.at)
      if (at) candidates.push(at)
    }
  }

  const updatedAt = toMillis(ticket.updatedAt)
  if (updatedAt) candidates.push(updatedAt)

  if (!candidates.length) return null
  return Math.max(...candidates)
}

export function isExternalizedTicketStaleAlert(ticket: TicketAlertSnapshot): boolean {
  if (!isExternalizedAwaitingProvider(ticket)) return false
  const lastAt = getLastExternalFollowUpAt(ticket)
  if (!lastAt) return false
  return getTicketAgeDays(lastAt) >= STALE_TICKET_DAYS
}

export const STALE_TICKET_CARD_CLASS =
  'border-red-400 bg-red-50 ring-1 ring-red-200 hover:border-red-500 hover:bg-red-50'

export const STALE_TICKET_CARD_CLASS_COMPACT =
  'border-red-400 bg-red-50 ring-1 ring-red-200 hover:bg-red-50'

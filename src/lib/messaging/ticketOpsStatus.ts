export type TicketOpsStatusLike = {
  externalized?: boolean | null
  status?: string | null
  workflowStage?: string | null
}

const CLOSED_WORKFLOW_STAGES = new Set([
  'externalized',
  'resolved_admin',
  'resolved_planner',
  'closed',
])

const CLOSED_TICKET_STATUSES = new Set(['validat', 'fet'])

export function isTicketOpsActive(ticket: TicketOpsStatusLike): boolean {
  if (ticket.externalized) return false

  const workflowStage = String(ticket.workflowStage || 'tickets_inbox').trim().toLowerCase()
  if (CLOSED_WORKFLOW_STAGES.has(workflowStage)) return false

  const status = String(ticket.status || 'nou').trim().toLowerCase()
  return !CLOSED_TICKET_STATUSES.has(status)
}

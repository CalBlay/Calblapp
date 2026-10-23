type MaintenanceTicketExplanationSource = {
  description?: string | null
  sourceMessageText?: string | null
  operatorTitle?: string | null
}

export function resolveMaintenanceTicketCreatorExplanation(
  ticket: MaintenanceTicketExplanationSource
) {
  return String(
    ticket.description || ticket.sourceMessageText || ticket.operatorTitle || ''
  ).trim()
}

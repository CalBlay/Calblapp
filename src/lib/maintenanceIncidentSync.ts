export type MaintenanceIncidentResolutionInput = {
  ticketId: string
  ticketCode?: string | null
  resolvedAt: number
  resolvedById?: string | null
  resolvedByName?: string | null
  resolutionNote?: string | null
}

export function buildResolvedIncidentPatch(
  input: MaintenanceIncidentResolutionInput
): Record<string, unknown> {
  const ticketCode = String(input.ticketCode || '').trim()
  const resolutionNote = String(input.resolutionNote || '').trim()

  return {
    status: 'resolt',
    resolutionNote:
      resolutionNote ||
      (ticketCode
        ? `Ticket ${ticketCode} resolt des del mòdul de manteniment.`
        : 'Ticket resolt des del mòdul de manteniment.'),
    resolvedAt: input.resolvedAt,
    resolvedById: String(input.resolvedById || '').trim() || null,
    resolvedByName: String(input.resolvedByName || '').trim() || null,
    maintenanceTicketId: String(input.ticketId || '').trim(),
    maintenanceTicketCode: ticketCode || null,
    resolvedFromMaintenanceTicket: true,
    updatedAt: input.resolvedAt,
  }
}

export function buildReopenedIncidentPatch(input: {
  ticketId: string
  reopenedAt: number
  reopenedById?: string | null
  reopenedByName?: string | null
  reason?: string | null
}): Record<string, unknown> {
  const reason = String(input.reason || '').trim()
  return {
    status: 'en_curs',
    resolutionNote: reason ? `Resolució rebutjada: ${reason}` : 'Resolució rebutjada.',
    resolvedAt: null,
    resolvedById: null,
    resolvedByName: null,
    resolvedFromMaintenanceTicket: false,
    maintenanceTicketId: String(input.ticketId || '').trim(),
    reopenedAt: input.reopenedAt,
    reopenedById: String(input.reopenedById || '').trim() || null,
    reopenedByName: String(input.reopenedByName || '').trim() || null,
    updatedAt: input.reopenedAt,
  }
}

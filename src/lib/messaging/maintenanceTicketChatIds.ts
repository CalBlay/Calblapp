export function buildMaintenanceTicketChannelId(ticketId: string) {
  return `maintenance_ticket_${String(ticketId || '').trim()}`
}

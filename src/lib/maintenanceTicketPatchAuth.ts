/**
 * Authorization for PATCH /api/maintenance/tickets/[id] mutations.
 *
 * View access alone is not enough to mutate tickets. Qualitat Cuina Central
 * visibility is explicitly read-only; creators may only use the dedicated
 * validationApproval=creator path (handled separately before this check).
 * Assigned workers (role treballador) may continue journey updates.
 */
export function canActorMutateMaintenanceTicket(params: {
  role?: string | null
  userId?: string | null
  assignedToIds?: unknown
  canManageTickets: boolean
  canManageInbox: boolean
}): boolean {
  if (params.canManageTickets || params.canManageInbox) return true

  const role = String(params.role || '')
    .trim()
    .toLowerCase()
  if (role !== 'treballador') return false

  const userId = String(params.userId || '').trim()
  if (!userId) return false

  const assignedIds = Array.isArray(params.assignedToIds)
    ? params.assignedToIds.map((id) => String(id || '').trim()).filter(Boolean)
    : []

  return assignedIds.includes(userId)
}

import { canManageMaintenanceTickets } from '@/lib/accessControl'
import { MAINTENANCE_TICKETS_INBOX_PERM } from '@/lib/maintenanceTicketsPermissions'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

/** Servidor: pot veure/gestionar tots els tickets de la safata. */
export async function canManageMaintenanceTicketInbox(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  if (canManageMaintenanceTickets(accessUser)) return true
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_INBOX_PERM,
  })
}

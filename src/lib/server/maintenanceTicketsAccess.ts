import {
  MAINTENANCE_TICKETS_DELETE_PERM,
  MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
  MAINTENANCE_TICKETS_INBOX_PERM,
  MAINTENANCE_TICKETS_MANAGE_PERM,
  MAINTENANCE_TICKETS_REOPEN_PERM,
  MAINTENANCE_TICKETS_VALIDATE_PERM,
} from '@/lib/maintenanceTicketsPermissions'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

/** Servidor: pot veure/gestionar tots els tickets de la safata. */
export async function canManageMaintenanceTicketInbox(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_INBOX_PERM,
  })
}

/** Servidor: permÃ­s explÃ­cit per eliminar tickets encara que no siguin del creador. */
export async function canDeleteMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_DELETE_PERM,
  })
}

export async function canManageAllMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_MANAGE_PERM,
  })
}

export async function canValidateMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_VALIDATE_PERM,
  })
}

export async function canReopenMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_REOPEN_PERM,
  })
}

export async function canExternalizeMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
  })
}

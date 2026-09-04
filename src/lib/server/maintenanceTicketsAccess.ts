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
import { isQualitatDepartment } from '@/lib/maintenanceTicketCreators'
import { normalizeRole } from '@/lib/roles'
import {
  DECO_TICKETS_DELETE_PERM,
  DECO_TICKETS_EXTERNALIZE_PERM,
  DECO_TICKETS_INBOX_PERM,
  DECO_TICKETS_MANAGE_PERM,
  DECO_TICKETS_REOPEN_PERM,
  DECO_TICKETS_VALIDATE_PERM,
} from '@/lib/decoTicketsPermissions'

export type DecoTicketPermission =
  | 'inbox'
  | 'delete'
  | 'manage'
  | 'validate'
  | 'reopen'
  | 'externalize'

const DECO_PERMISSION_KEYS: Record<DecoTicketPermission, string> = {
  inbox: DECO_TICKETS_INBOX_PERM,
  delete: DECO_TICKETS_DELETE_PERM,
  manage: DECO_TICKETS_MANAGE_PERM,
  validate: DECO_TICKETS_VALIDATE_PERM,
  reopen: DECO_TICKETS_REOPEN_PERM,
  externalize: DECO_TICKETS_EXTERNALIZE_PERM,
}

export async function canUseDecoTicketPermission(
  user: Parameters<typeof accessUserFromAuth>[0],
  permission: DecoTicketPermission
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  if (!accessUser.id) return false
  return isUiPermissionGranted({
    user: accessUser,
    permission: DECO_PERMISSION_KEYS[permission],
  })
}

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

/** Qualitat: pot consultar tickets de manteniment de Cuina Central (sense gestionar la safata). */
export function canViewQualitatCuinaCentralMaintenanceTickets(
  user: Parameters<typeof accessUserFromAuth>[0]
): boolean {
  const accessUser = accessUserFromAuth(user)
  const role = normalizeRole(accessUser.role)
  if (role === 'admin' || role === 'direccio') return false
  return isQualitatDepartment(accessUser.department)
}

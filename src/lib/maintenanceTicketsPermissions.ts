import type { AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'

export const MAINTENANCE_TICKETS_UI_PATH = '/menu/manteniment/tickets'

export const MAINTENANCE_TICKETS_ACTION = {
  INBOX: 'tickets:inbox',
  DELETE: 'tickets:delete',
  MANAGE: 'tickets:manage',
  VALIDATE: 'tickets:validate',
  REOPEN: 'tickets:reopen',
  EXTERNALIZE: 'tickets:externalize',
} as const

export const MAINTENANCE_TICKETS_INBOX_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.INBOX
)

export const MAINTENANCE_TICKETS_DELETE_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.DELETE
)

export const MAINTENANCE_TICKETS_MANAGE_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.MANAGE
)

export const MAINTENANCE_TICKETS_VALIDATE_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.VALIDATE
)

export const MAINTENANCE_TICKETS_REOPEN_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.REOPEN
)

export const MAINTENANCE_TICKETS_EXTERNALIZE_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.EXTERNALIZE
)

/** Rol/departament que pot rebre el permís de safata (logística). */
export function baseCanReceiveMaintenanceTicketInboxNotifications(user?: AccessUser): boolean {
  void user
  return false
}

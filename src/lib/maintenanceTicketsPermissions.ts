import { isLogisticsMaintenanceTicketsManager, type AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'

export const MAINTENANCE_TICKETS_UI_PATH = '/menu/manteniment/tickets'

export const MAINTENANCE_TICKETS_ACTION = {
  INBOX: 'tickets:inbox',
} as const

export const MAINTENANCE_TICKETS_INBOX_PERM = PERM.action(
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_ACTION.INBOX
)

/** Rol/departament que pot rebre el permís de safata (logística). */
export function baseCanReceiveMaintenanceTicketInboxNotifications(user?: AccessUser): boolean {
  return isLogisticsMaintenanceTicketsManager(user)
}

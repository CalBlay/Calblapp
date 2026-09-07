import { normalizeDept, type AccessUser } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import { PERM } from '@/lib/permissionKeys'

export const DECO_UI_PATH = '/menu/deco'
export const DECO_TICKETS_UI_PATH = '/menu/deco/tickets'
export const DECO_PREPARATION_UI_PATH = '/menu/deco/preparacio'
export const DECO_PLANNER_UI_PATH = '/menu/deco/planificador'

export const DECO_TICKETS_ACTION = {
  INBOX: 'tickets:inbox',
  DELETE: 'tickets:delete',
  MANAGE: 'tickets:manage',
  VALIDATE: 'tickets:validate',
  REOPEN: 'tickets:reopen',
  EXTERNALIZE: 'tickets:externalize',
} as const

export const DECO_TICKETS_INBOX_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.INBOX)
export const DECO_TICKETS_DELETE_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.DELETE)
export const DECO_TICKETS_MANAGE_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.MANAGE)
export const DECO_TICKETS_VALIDATE_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.VALIDATE)
export const DECO_TICKETS_REOPEN_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.REOPEN)
export const DECO_TICKETS_EXTERNALIZE_PERM = PERM.action(DECO_TICKETS_UI_PATH, DECO_TICKETS_ACTION.EXTERNALIZE)
export function isDecoDepartment(raw?: string | null): boolean {
  const department = normalizeDept(raw)
  return department === 'deco' || department === 'decoracio' || department === 'decoracions'
}

/**
 * Deco ticket actions (inbox/manage/validate/…): view is required, an explicit
 * deny/allow override wins, otherwise the user must be able to edit the Deco tickets path.
 */
export function resolveDecoTicketActionGrant(params: {
  canViewTickets: boolean
  canEditTickets: boolean
  overrideEffect: unknown
}): boolean {
  if (!params.canViewTickets) return false
  if (params.overrideEffect === 'deny') return false
  if (params.overrideEffect === 'allow') return true
  return Boolean(params.canEditTickets)
}

export function canManageDecoTickets(user?: AccessUser | null): boolean {
  if (!user) return false
  const role = normalizeRole(user.role)
  return role === 'admin' || role === 'direccio' || (role === 'cap' && isDecoDepartment(user.department))
}

export function isDecoDepartmentHead(user?: AccessUser | null): boolean {
  if (!user) return false
  return normalizeRole(user.role) === 'cap' && isDecoDepartment(user.department)
}

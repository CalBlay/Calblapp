import { PERM } from '@/lib/permissionKeys'
import { isProductionWorker, type AccessUser } from '@/lib/accessControl'

export const INCIDENTS_UI_PATH = '/menu/incidents'
export const INCIDENTS_QUADRE_PATH = '/menu/incidents/quadre'

export const INCIDENTS_ACTION = {
  MEETING_MINUTES: 'meeting-minutes',
  COMMAND_BOARD: 'command-board',
  CATEGORY_EDIT: 'category-edit',
  TYPOLOGIES_MANAGE: 'typologies-manage',
} as const

export const INCIDENTS_MEETING_MINUTES_PERM = PERM.action(
  INCIDENTS_UI_PATH,
  INCIDENTS_ACTION.MEETING_MINUTES
)

export const INCIDENTS_COMMAND_BOARD_PERM = PERM.action(
  INCIDENTS_UI_PATH,
  INCIDENTS_ACTION.COMMAND_BOARD
)

export const INCIDENTS_CATEGORY_EDIT_PERM = PERM.action(
  INCIDENTS_UI_PATH,
  INCIDENTS_ACTION.CATEGORY_EDIT
)

export const INCIDENTS_TYPOLOGIES_MANAGE_PERM = PERM.action(
  INCIDENTS_UI_PATH,
  INCIDENTS_ACTION.TYPOLOGIES_MANAGE
)

/** Accés base per aplicar un allow explícit (Settings → permisos). */
export function incidentsActionBaseAccess(
  user: AccessUser,
  opts: { canViewIncidents: boolean; canEditIncidents: boolean; canViewQuadrePath: boolean },
  action: (typeof INCIDENTS_ACTION)[keyof typeof INCIDENTS_ACTION]
): boolean {
  if (action === INCIDENTS_ACTION.MEETING_MINUTES) {
    return opts.canViewIncidents && opts.canEditIncidents
  }
  if (opts.canViewIncidents && opts.canEditIncidents) return true
  if (isProductionWorker(user) && opts.canViewQuadrePath) return true
  return false
}

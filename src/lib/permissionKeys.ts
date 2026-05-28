export const PERM = {
  view: (path: string) => `ui:view:${path}`,
  edit: (path: string) => `ui:edit:${path}`,
  action: (path: string, action: string) => `ui:action:${path}:${action}`,
} as const

export type UiPermissionKey = `ui:${string}`

export const isViewPerm = (p?: string | null) => String(p || '').startsWith('ui:view:')
export const viewPathFromPerm = (p: string) => String(p || '').replace(/^ui:view:/, '')

export const isEditPerm = (p?: string | null) => String(p || '').startsWith('ui:edit:')
export const editPathFromPerm = (p: string) => String(p || '').replace(/^ui:edit:/, '')

export const isActionPerm = (p?: string | null) => String(p || '').startsWith('ui:action:')
export const actionPermKey = (p?: string | null) => String(p || '').trim()

/** `ui:action:/menu/calendar:manual:create` → { path, action } */
export function parseActionPermission(permission: string): { path: string; action: string } | null {
  const m = String(permission || '').match(/^ui:action:(\/menu\/[^:]+):(.+)$/)
  if (!m) return null
  return { path: m[1], action: m[2] }
}

/** Accions de calendari que s’impliquen quan l’usuari té edició al mòdul. */
export const CALENDAR_EDIT_IMPLIED_ACTIONS = new Set([
  'manual:create',
  'manual:update',
  'attach:sharepoint',
])

export { SPACES_EDIT_IMPLIED_ACTIONS } from '@/lib/spacesPermissions'


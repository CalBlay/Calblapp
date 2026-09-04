import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

export const EVENT_CLOSING_ACTION = 'event:close'

export function canEnableEventClosingAction(params: {
  canViewEvents: boolean
  canEditEvents: boolean
  hasClosingOverride: boolean
}): boolean {
  return params.canViewEvents && params.canEditEvents && params.hasClosingOverride
}

export function canOpenEventClosing(params: {
  role?: string | null
  hasClosingPermission: boolean
}): boolean {
  if (!params.hasClosingPermission) return false
  const role = normalizeRole(params.role || undefined)
  return ['admin', 'direccio', 'cap', 'comercial', 'treballador'].includes(role)
}

export function canCloseEventDepartment(params: {
  role?: string | null
  userDepartment?: string | null
  targetDepartment?: string | null
  hasClosingPermission: boolean
}): boolean {
  if (
    !canOpenEventClosing({
      role: params.role,
      hasClosingPermission: params.hasClosingPermission,
    })
  ) {
    return false
  }

  const role = normalizeRole(params.role || undefined)
  if (role === 'admin' || role === 'direccio' || role === 'cap') return true

  const userDepartment = normalizeDept(params.userDepartment)
  const targetDepartment = normalizeDept(params.targetDepartment)
  return Boolean(userDepartment && targetDepartment && userDepartment === targetDepartment)
}

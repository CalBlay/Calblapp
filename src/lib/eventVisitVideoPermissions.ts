import type { AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'

export const EVENT_VISIT_VIDEO_ACTION = 'docs:attach:visit-video'
export const EVENT_VISIT_VIDEO_PERM = PERM.action('/menu/events', EVENT_VISIT_VIDEO_ACTION)

/** Converteix la sessió API en usuari d'accés per comprovacions de permís. */
export function visitVideoAccessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean | null
  isDepartmentRobaLead?: boolean | null
  robaLinkedPersonnelId?: string | null
  isTransportLead?: boolean | null
}): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    isTransportLead: Boolean(user.isTransportLead),
  }
}

/**
 * Rol/departament que pot rebre el permís a Configuració → Permisos.
 * Cal marcar explícitament «allow»; sense override, no pot adjuntar.
 */

const COMMERCIAL_DEPARTMENTS = new Set([
  'comercial',
  'empresa',
  'casaments',
  'foodlovers',
  'food lover',
  'agenda',
])

function norm(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function baseCanAttachEventVisitVideo(user: {
  role?: string | null
  department?: string | null
}): boolean {
  const roleN = norm(user.role)
  if (roleN === 'admin' || roleN === 'direccio') return true
  if (roleN === 'comercial') return true

  const deptN = norm(user.department)
  const isCapDept = roleN === 'cap' || (roleN.includes('cap') && roleN.includes('depart'))
  if (isCapDept && COMMERCIAL_DEPARTMENTS.has(deptN)) return true

  return false
}

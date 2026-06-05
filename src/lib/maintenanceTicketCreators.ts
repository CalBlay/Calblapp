import { normalizeDept, isMaintenanceCapDepartment } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import { resolveOpsChannelByLocationName } from '@/lib/opsMessagingChannels'

export function isCuinaCentralDepartment(raw?: string | null) {
  const dept = normalizeDept(raw)
  return dept === 'cuina central' || dept.replace(/\s+/g, '') === 'cuinacentral'
}

/** Ubicació del ticket (p. ex. des del mòdul Cuina central de la webapp). */
export function isCuinaCentralLocation(raw?: string | null) {
  const loc = normalizeDept(raw)
  return loc === 'cuina central' || loc.replace(/\s+/g, '') === 'cuinacentral'
}

/** Personal de restaurant (OPS) que crea tickets al mòdul Tickets. */
export function isRestaurantOpsDepartment(raw?: string | null) {
  const dept = normalizeDept(raw)
  return (
    dept === 'serveis' ||
    dept === 'restauracio' ||
    dept.includes('restaurant')
  )
}

export function isMaintenanceTicketCreatorDepartment(raw?: string | null) {
  return isCuinaCentralDepartment(raw) || isRestaurantOpsDepartment(raw)
}

export function isMaintenanceTicketCreatorOnlyUser(user: {
  role?: string | null
  department?: string | null
}) {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  if (role === 'admin' || role === 'direccio') return false
  if (role === 'cap' && isMaintenanceCapDepartment(dept)) return false
  return isMaintenanceTicketCreatorDepartment(dept)
}

export type ManualTicketRouting = {
  source: 'manual' | 'manual_cuina_central'
  intakeChannel: 'manual_tickets' | 'manual_cuina_central' | 'restaurant'
  workflowStage: 'tickets_inbox' | 'planner_queue'
}

/** Encaminament en crear un ticket manual segons departament i ubicació. */
export function resolveManualTicketRouting(params: {
  department?: string | null
  location: string
}): ManualTicketRouting {
  const location = String(params.location || '').trim()

  if (isCuinaCentralDepartment(params.department) || isCuinaCentralLocation(params.location)) {
    return {
      source: 'manual_cuina_central',
      intakeChannel: 'manual_cuina_central',
      workflowStage: 'planner_queue',
    }
  }

  const ops = resolveOpsChannelByLocationName(location)
  if (ops?.source === 'restaurants' || isRestaurantOpsDepartment(params.department)) {
    return {
      source: 'manual',
      intakeChannel: 'restaurant',
      workflowStage: 'tickets_inbox',
    }
  }

  return {
    source: 'manual',
    intakeChannel: 'manual_tickets',
    workflowStage: 'tickets_inbox',
  }
}

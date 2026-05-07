import { normalizeRole } from '@/lib/roles'
import { isProductionWorker, normalizeDept } from '@/lib/accessControl'

/** Mateix criteri que el mòdul Incidències al menú (API / pantalles). */
export function canAccessIncidentsModule(user: { role?: string | null; department?: string | null }): boolean {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  const allowedRoles = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])
  if (role === 'treballador' && dept === 'produccio') return true
  if (!allowedRoles.has(role)) return false
  if (role === 'admin' || role === 'direccio' || role === 'comercial') return true
  const allowedDepts = new Set(['produccio', 'logistica', 'cuina', 'serveis', 'marqueting', 'marketing'])
  return allowedDepts.has(dept)
}

/**
 * Crear incidència (p. ex. des d’auditoria / tancament operatiu).
 * Alineat amb `canCreateIncident` a EventMenuModal (inclou treballador amb accés al flux al client).
 */
export function canPostIncident(user: { role?: string | null; department?: string | null }): boolean {
  const role = normalizeRole(user.role)
  if (role === 'admin' || role === 'direccio' || role === 'comercial') return true
  if (role === 'treballador') return true
  if (role === 'cap') return true
  return false
}

/** Llegir categories per al formulari de creació (inclou usuaris que poden crear però no veuen el tauler). */
export function canFetchIncidentCategories(user: { role?: string | null; department?: string | null }): boolean {
  return canAccessIncidentsModule(user) || canPostIncident(user)
}

/** Edició del catàleg de tipologies: admin, direcció, cap de producció. */
export function canManageIncidentCategories(user: { role?: string | null; department?: string | null }): boolean {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  if (role === 'admin' || role === 'direccio') return true
  if (role === 'cap' && dept === 'produccio') return true
  return false
}

function normalizeIdentity(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function canDeleteIncident(
  user: { id?: string | null; role?: string | null; department?: string | null; name?: string | null; email?: string | null },
  incident: { createdById?: string | null; createdBy?: string | null }
): boolean {
  if (
    isProductionWorker({
      role: user.role ?? undefined,
      department: user.department ?? undefined,
    })
  ) {
    return false
  }

  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')

  if (role === 'admin') return true
  if (role === 'cap' && dept === 'produccio') return true

  const userId = String(user.id || '').trim()
  if (userId && userId === String(incident.createdById || '').trim()) return true

  // Compatibilitat amb incidències antigues sense createdById.
  const ownerAliases = new Set(
    [user.name, user.email]
      .map((value) => normalizeIdentity(value || ''))
      .filter(Boolean)
  )
  const createdBy = normalizeIdentity(incident.createdBy || '')
  return Boolean(createdBy && ownerAliases.has(createdBy))
}

export const INCIDENT_STATUS_VALUES = ['obert', 'en_curs', 'resolt', 'tancat'] as const
export type IncidentWorkflowStatus = (typeof INCIDENT_STATUS_VALUES)[number]

export function normalizeIncidentStatus(raw?: string | null): IncidentWorkflowStatus {
  const v = (raw || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  if (v === 'en_curs' || v === 'encurs') return 'en_curs'
  if (v === 'resolt' || v === 'resolta') return 'resolt'
  if (v === 'tancat' || v === 'tancada') return 'tancat'
  return 'obert'
}

export const INCIDENT_ACTION_STATUS = ['open', 'in_progress', 'done', 'cancelled'] as const
export type IncidentActionStatus = (typeof INCIDENT_ACTION_STATUS)[number]

export function normalizeIncidentActionStatus(raw?: string | null): IncidentActionStatus {
  const v = (raw || '').toLowerCase().trim()
  if (v === 'in_progress' || v === 'en_curs') return 'in_progress'
  if (v === 'done' || v === 'fet' || v === 'completed') return 'done'
  if (v === 'cancelled' || v === 'cancelat' || v === 'cancelada') return 'cancelled'
  return 'open'
}

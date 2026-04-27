import { normalizeRole } from '@/lib/roles'
import { normalizeDept } from '@/lib/accessControl'

/** Mateix criteri que el mòdul Incidències al menú (API / pantalles). */
export function canAccessIncidentsModule(user: { role?: string | null; department?: string | null }): boolean {
  const role = normalizeRole(user.role || '')
  const dept = normalizeDept(user.department || '')
  const allowedRoles = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])
  if (!allowedRoles.has(role)) return false
  if (role === 'admin' || role === 'direccio' || role === 'comercial') return true
  const allowedDepts = new Set(['produccio', 'logistica', 'cuina', 'serveis'])
  return allowedDepts.has(dept)
}

/**
 * Crear incidència (p. ex. des d’auditoria / tancament operatiu).
 * Alineat amb `canCreateIncident` a EventMenuModal (inclou treballador amb accés al flux al client).
 */
export function canPostIncident(user: { role?: string | null; department?: string | null }): boolean {
  const role = normalizeRole(user.role)
  const dept = normalizeDept(user.department || '')
  if (role === 'admin' || role === 'direccio' || role === 'comercial') return true
  if (role === 'treballador') return true
  const capDepts = new Set(['foodlovers', 'logistica', 'cuina', 'serveis'])
  if (role === 'cap' && capDepts.has(dept)) return true
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

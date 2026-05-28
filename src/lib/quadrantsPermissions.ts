import { type AccessUser } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

export const QUADRANTS_UI_PATH = '/menu/quadrants'

export const QUADRANTS_ACTION = {
  PREMISSES_EDIT: 'premisses:edit',
} as const

export const QUADRANTS_ALLOWED_DEPARTMENTS = new Set(['serveis', 'logistica', 'cuina'])

const normDept = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Mateixa política que l’API històrica de premisses de quadrants. */
export function baseCanEditQuadrantsPremisses(user?: AccessUser): boolean {
  const role = normalizeRole(user?.role)
  return role === 'admin' || role === 'direccio' || role === 'cap'
}

export function canAccessQuadrantsPremissesDepartment(params: {
  role: string
  sessionDept: string
  requestedDept: string
}): boolean {
  const role = normalizeRole(params.role)
  const sessionDept = normDept(params.sessionDept)
  const requestedDept = normDept(params.requestedDept)
  if (role === 'admin' || role === 'direccio') return true
  if (role === 'cap') return sessionDept === requestedDept
  return false
}

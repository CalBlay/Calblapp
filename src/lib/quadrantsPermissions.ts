import { type AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'

export const QUADRANTS_UI_PATH = '/menu/quadrants'

export const QUADRANTS_ACTION = {
  PREMISSES_EDIT: 'premisses:edit',
  /** Permís explícit per reobrir un quadrant confirmat. No s’implica des de confirmar. */
  REOPEN: 'draft:unconfirm',
} as const

export const QUADRANTS_REOPEN_PERM = PERM.action(QUADRANTS_UI_PATH, QUADRANTS_ACTION.REOPEN)

type QuadrantConfirmationRecord = {
  status?: string | null
  state?: string | null
  quadrantStatus?: string | null
  confirmed?: boolean | null
  confirmedAt?: unknown
}

export function isQuadrantRecordConfirmed(
  record?: QuadrantConfirmationRecord | null
): boolean {
  if (!record) return false
  if (record.confirmed === true) return true
  if (record.confirmedAt != null && String(record.confirmedAt).trim() !== '') return true
  return [record.status, record.state, record.quadrantStatus].some(
    (value) => String(value || '').toLowerCase() === 'confirmed'
  )
}

export function hasQuadrantsReopenAction(hasAction: (key: string) => boolean): boolean {
  return hasAction(QUADRANTS_REOPEN_PERM)
}

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

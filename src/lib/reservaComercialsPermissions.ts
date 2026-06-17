import { normalizeDept } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

export const RESERVA_COMERCIALS_UI_PATH = '/menu/logistica/reserva-comercials'

/** Per defecte: només admin i cap de transports (isTransportLead). */
export function baseCanValidateReservaComercials(user?: {
  role?: string | null
  isTransportLead?: boolean | null
}): boolean {
  if (!user) return false
  const role = normalizeRole(user.role || undefined)
  return role === 'admin' || user.isTransportLead === true
}

/** Per defecte: admin, direcció, cap de transports o cap de logística. Es pot concedir via matriu de permisos. */
export function baseCanKeysHandoverReservaComercials(user?: {
  role?: string | null
  department?: string | null
  isTransportLead?: boolean | null
}): boolean {
  if (!user) return false
  const role = normalizeRole(user.role || undefined)
  if (role === 'admin' || role === 'direccio') return true
  if (user.isTransportLead === true) return true
  if (role === 'cap' && normalizeDept(user.department) === 'logistica') return true
  return false
}

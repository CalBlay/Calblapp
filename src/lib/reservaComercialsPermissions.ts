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

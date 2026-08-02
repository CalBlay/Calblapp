import type { AuthFailure, AuthSuccess } from '@/lib/server/apiAuth'
import { requireRoles } from '@/lib/server/apiAuth'
import type { Role } from '@/lib/roles'

export const EVENT_COMANDA_ADMIN_ROLES = ['admin', 'direccio'] as const satisfies readonly Role[]

export function requireEventComandaAdmin(auth: AuthSuccess): AuthFailure | null {
  return requireRoles(auth, EVENT_COMANDA_ADMIN_ROLES)
}

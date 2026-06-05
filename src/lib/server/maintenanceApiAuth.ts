import { NextResponse } from 'next/server'
import { canManageMaintenanceTickets } from '@/lib/accessControl'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'

/** Accés a dades mestres de manteniment (màquines, proveïdors, centres). */
export async function requireMaintenanceDataAccess(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  if (!canManageMaintenanceTickets(auth.user)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

import { NextResponse } from 'next/server'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath } from '@/lib/server/permissions'
import { ASSIGNACIONS_UI_PATH } from '@/lib/assignacionsPermissions'

/**
 * Mutate live quadrant conductor rows from Assignacions.
 * GET /api/transports/assignacions stays session-only (Reserva comercials reads it).
 */
export async function requireAssignacionsEdit(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const canEdit = await canEditUiPath({ user: auth.user, path: ASSIGNACIONS_UI_PATH })
  if (!canEdit) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

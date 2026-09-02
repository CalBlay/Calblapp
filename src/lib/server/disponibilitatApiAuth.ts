import { NextResponse } from 'next/server'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath } from '@/lib/server/permissions'
import { DISPONIBILITAT_UI_PATH } from '@/lib/disponibilitatPermissions'

/**
 * Mutate transportAssignmentsV2 from Disponibilitat (create / confirm / cancel).
 * GET /api/transports/assign is not gated here (unauthenticated list is #73).
 */
export async function requireDisponibilitatEdit(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const canEdit = await canEditUiPath({ user: auth.user, path: DISPONIBILITAT_UI_PATH })
  if (!canEdit) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

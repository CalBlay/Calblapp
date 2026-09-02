import { NextResponse } from 'next/server'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath } from '@/lib/server/permissions'
import { TRANSPORTS_UI_PATH } from '@/lib/transportsPermissions'

/** Mutate the vehicle catalog (create / update / delete). GET stays session-only. */
export async function requireTransportsFleetEdit(
  auth: AuthSuccess
): Promise<NextResponse | null> {
  const canEdit = await canEditUiPath({ user: auth.user, path: TRANSPORTS_UI_PATH })
  if (!canEdit) {
    return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
  }
  return null
}

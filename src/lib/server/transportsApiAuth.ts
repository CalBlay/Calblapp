import { NextResponse } from 'next/server'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, isUiPermissionGranted } from '@/lib/server/permissions'
import {
  TRANSPORTS_TYPES_MANAGE_PERM,
  TRANSPORTS_UI_PATH,
} from '@/lib/transportsPermissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

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

export async function requireTransportsTypesManage(
  auth: AuthSuccess
): Promise<NextResponse | null> {
  const accessUser = accessUserFromAuth(auth.user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) return NextResponse.json({ error: 'Sense permisos' }, { status: 403 })

  const granted = await isUiPermissionGranted({
    user: { ...accessUser, id: userId },
    permission: TRANSPORTS_TYPES_MANAGE_PERM,
  })
  return granted ? null : NextResponse.json({ error: 'Sense permisos' }, { status: 403 })
}

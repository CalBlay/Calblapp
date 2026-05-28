import type { AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'
import {
  QUADRANTS_ACTION,
  QUADRANTS_UI_PATH,
  canAccessQuadrantsPremissesDepartment,
} from '@/lib/quadrantsPermissions'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export async function requireQuadrantsPremissesEdit(
  auth: AuthSuccess,
  requestedDept: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  const granted = await isUiPermissionGranted({
    user: accessUser,
    permission: PERM.action(QUADRANTS_UI_PATH, QUADRANTS_ACTION.PREMISSES_EDIT),
  })
  if (!granted) return false
  return canAccessQuadrantsPremissesDepartment({
    role: String(accessUser.role || ''),
    sessionDept: String(accessUser.department || ''),
    requestedDept,
  })
}

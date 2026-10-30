import { PERM } from '@/lib/permissionKeys'
import {
  QUADRANTS_ACTION,
  QUADRANTS_UI_PATH,
  canAccessQuadrantsPremissesDepartment,
} from '@/lib/quadrantsPermissions'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export async function requireQuadrantsPremissesEdit(
  auth: AuthSuccess,
  requestedDept: string
): Promise<boolean> {
  const sessionUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  const userSnap = await firestoreAdmin.collection('users').doc(sessionUser.id).get()
  const freshUser = userSnap.exists
    ? (userSnap.data() as { role?: unknown; department?: unknown })
    : null
  const accessUser = {
    ...sessionUser,
    role:
      typeof freshUser?.role === 'string' ? freshUser.role : sessionUser.role,
    department:
      typeof freshUser?.department === 'string'
        ? freshUser.department
        : sessionUser.department,
  }
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

import type { AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'
import {
  SPACES_BBDD_PATH,
  SPACES_PREMISSES_PATH,
  SPACES_RESERVES_PATH,
} from '@/lib/spacesPermissions'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'

export function accessUserFromAuth(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  isTransportLead?: boolean
}): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role,
    department: user.department,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    isTransportLead: Boolean(user.isTransportLead),
  }
}

export async function requireSpacesView(
  auth: AuthSuccess,
  subpath: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  return canViewUiPath({ user: accessUser, path: subpath })
}

export async function requireSpacesEdit(
  auth: AuthSuccess,
  subpath: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  return canEditUiPath({ user: accessUser, path: subpath })
}

export async function requireSpacesAction(
  auth: AuthSuccess,
  action: string,
  actionPath?: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  const path = actionPath || SPACES_BBDD_PATH
  return isUiPermissionGranted({
    user: accessUser,
    permission: PERM.action(path, action),
  })
}

export async function requireSpacesBbddMutation(
  auth: AuthSuccess,
  kind: 'create' | 'update' | 'delete'
): Promise<boolean> {
  const action =
    kind === 'create'
      ? 'bbdd:create'
      : kind === 'update'
        ? 'bbdd:update'
        : 'bbdd:delete'
  return requireSpacesAction(auth, action)
}

export const SPACES_API_PATHS = {
  reserves: SPACES_RESERVES_PATH,
  bbdd: SPACES_BBDD_PATH,
  premisses: SPACES_PREMISSES_PATH,
} as const

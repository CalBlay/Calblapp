import { NextResponse } from 'next/server'
import type { AccessUser } from '@/lib/accessControl'
import { PERM } from '@/lib/permissionKeys'
import {
  requireAuth,
  type AuthFailure,
  type AuthSuccess,
  type SessionUserForApi,
} from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'

export const ALLERGENS_BBDD_PATH = '/menu/allergens/bbdd'
export const ALLERGENS_BUSCADOR_PATH = '/menu/allergens/buscador'

export function accessUserFromSession(authUser: SessionUserForApi): AccessUser & { id: string } {
  return {
    id: authUser.id,
    role: authUser.role ?? undefined,
    department: authUser.department ?? undefined,
    canRespondSurveys: Boolean(authUser.canRespondSurveys),
    isDepartmentRobaLead: Boolean(authUser.isDepartmentRobaLead),
    robaLinkedPersonnelId: authUser.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof authUser.opsProjectsConfigurable === 'boolean'
        ? authUser.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(authUser.isTransportLead),
  }
}

export async function requireAllergensModuleView(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const accessUser = accessUserFromSession(auth.user)
  const [canBbdd, canBuscador] = await Promise.all([
    canViewUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH }),
    canViewUiPath({ user: accessUser, path: ALLERGENS_BUSCADOR_PATH }),
  ])
  if (!canBbdd && !canBuscador) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

export async function requireAllergensBbddView(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const accessUser = accessUserFromSession(auth.user)
  const canView = await canViewUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
  if (!canView) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

export async function requireAllergensBbddEdit(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAllergensBbddView()
  if (!auth.ok) return auth

  const accessUser = accessUserFromSession(auth.user)
  const canEdit = await canEditUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
  if (!canEdit) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return auth
}

export async function requireAllergensImportOrReplace(auth: AuthSuccess): Promise<AuthFailure | null> {
  const accessUser = accessUserFromSession(auth.user)
  const canEdit = await canEditUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
  const importOverride = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: PERM.action(ALLERGENS_BBDD_PATH, 'import'),
  })
  const replaceOverride = await isAllowedByClientOverride({
    userId: auth.user.id,
    role: auth.user.role,
    permission: PERM.action(ALLERGENS_BBDD_PATH, 'replace'),
  })

  if (!canEdit && importOverride !== true && replaceOverride !== true) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return null
}

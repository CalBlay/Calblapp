import { NextResponse } from 'next/server'
import { canPostIncident } from '@/lib/incidentPolicy'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath, isUiPermissionGranted } from '@/lib/server/permissions'
import {
  INCIDENTS_CATEGORY_EDIT_PERM,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_TYPOLOGIES_MANAGE_PERM,
  INCIDENTS_QUADRE_PATH,
  INCIDENTS_UI_PATH,
} from '@/lib/incidentsPermissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export { INCIDENTS_QUADRE_PATH, INCIDENTS_UI_PATH }

/** Quadre de comandament: acció configurable (Settings → permisos). */
export async function canViewIncidentsCommandBoard(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) return false
  return isUiPermissionGranted({
    user: { ...accessUser, id: userId },
    permission: INCIDENTS_COMMAND_BOARD_PERM,
  })
}

/** Mateix criteri que el menú i `/api/permissions/ui` (rol + overrides). */
export async function canViewIncidentsModule(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) return false
  const userWithId = { ...accessUser, id: userId }
  const [canBoard, canQuadre] = await Promise.all([
    canViewUiPath({ user: userWithId, path: INCIDENTS_UI_PATH }),
    canViewIncidentsCommandBoard(user),
  ])
  return canBoard || canQuadre
}

export async function canEditIncidentsModule(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) return false
  return canEditUiPath({ user: { ...accessUser, id: userId }, path: INCIDENTS_UI_PATH })
}

export async function requireIncidentsModuleView(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const canView = await canViewIncidentsModule(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  if (!canView) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

/** Categories per al formulari de creació: tauler o qui pot crear incidències. */
export async function requireIncidentsMeetingMinutes(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const accessUser = accessUserFromAuth(auth.user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  const granted = await isUiPermissionGranted({
    user: { ...accessUser, id: userId },
    permission: INCIDENTS_MEETING_MINUTES_PERM,
  })
  if (!granted) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

export async function requireIncidentCategoriesRead(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const canView = await canViewIncidentsModule(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  if (!canView && !canPostIncident(auth.user)) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

export async function requireIncidentsCategoryEdit(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const accessUser = accessUserFromAuth(auth.user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  const granted = await isUiPermissionGranted({
    user: { ...accessUser, id: userId },
    permission: INCIDENTS_CATEGORY_EDIT_PERM,
  })
  if (!granted) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

export async function requireIncidentsTypologiesManage(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const accessUser = accessUserFromAuth(auth.user)
  const userId = String(accessUser.id || '').trim()
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  const granted = await isUiPermissionGranted({
    user: { ...accessUser, id: userId },
    permission: INCIDENTS_TYPOLOGIES_MANAGE_PERM,
  })
  if (!granted) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

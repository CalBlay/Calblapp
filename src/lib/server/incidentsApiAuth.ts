import { NextResponse } from 'next/server'
import { canPostIncident } from '@/lib/incidentPolicy'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { canViewUiPath } from '@/lib/server/permissions'
import { INCIDENTS_QUADRE_PATH, INCIDENTS_UI_PATH } from '@/lib/incidentsPermissions'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'

export { INCIDENTS_QUADRE_PATH, INCIDENTS_UI_PATH }

/** Mateix criteri que el menú i `/api/permissions/ui` (rol + overrides). */
export async function canViewIncidentsModule(
  user: Parameters<typeof accessUserFromAuth>[0]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(user)
  const [canBoard, canQuadre] = await Promise.all([
    canViewUiPath({ user: accessUser, path: INCIDENTS_UI_PATH }),
    canViewUiPath({ user: accessUser, path: INCIDENTS_QUADRE_PATH }),
  ])
  return canBoard || canQuadre
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

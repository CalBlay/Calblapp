import { NextResponse } from 'next/server'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'
import {
  canViewUiPath,
  getClientOverrideEffectForPermission,
} from '@/lib/server/permissions'
import {
  QUADRANTS_MEETING_MINUTES_PERM,
  QUADRANTS_UI_PATH,
} from '@/lib/quadrantsPermissions'

/** Lectura de quadrants/torns: cal sessió i visibilitat del mòdul. */
export async function requireQuadrantsModuleRead(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const user = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  const [canQuadrants, canTorns] = await Promise.all([
    canViewUiPath({ user, path: '/menu/quadrants' }),
    canViewUiPath({ user, path: '/menu/torns' }),
  ])

  if (!canQuadrants && !canTorns) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return auth
}

/** Acta de reunió: acció opt-in configurable a Settings → permisos. */
export async function requireQuadrantsMeetingMinutes(): Promise<AuthSuccess | AuthFailure> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const user = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  const userId = String(user.id || '').trim()
  if (!userId) {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }

  const userWithId = { ...user, id: userId }
  const [canView, effect] = await Promise.all([
    canViewUiPath({ user: userWithId, path: QUADRANTS_UI_PATH }),
    getClientOverrideEffectForPermission(userId, QUADRANTS_MEETING_MINUTES_PERM),
  ])
  if (!canView || effect !== 'allow') {
    return { ok: false, res: NextResponse.json({ error: 'Sense permisos' }, { status: 403 }) }
  }
  return auth
}

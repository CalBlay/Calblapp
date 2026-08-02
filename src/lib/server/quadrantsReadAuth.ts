import { NextResponse } from 'next/server'
import { requireAuth, type AuthFailure, type AuthSuccess } from '@/lib/server/apiAuth'
import { accessUserFromAuth } from '@/lib/server/spacesApiAuth'
import { canViewUiPath } from '@/lib/server/permissions'

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

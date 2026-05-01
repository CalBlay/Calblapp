import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import type { NextResponse } from 'next/server'

export type RobaPersonalAdminOk = { ok: true; userId: string }
export type RobaPersonalAdminFail = { ok: false; res: NextResponse }

export async function requireRobaPersonalAdmin(): Promise<
  RobaPersonalAdminOk | RobaPersonalAdminFail
> {
  const auth = await requireAuth()
  if (!auth.ok) return auth
  const forbidden = requireRoles(auth, ['admin'])
  if (forbidden) return forbidden
  return { ok: true, userId: auth.user.id }
}

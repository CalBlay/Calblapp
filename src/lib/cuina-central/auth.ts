import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { normalizeRole } from '@/lib/roles'

export type CuinaCentralSessionUser = {
  id: string
  name?: string | null
  email?: string | null
  role?: string
}

/** Cuina central: només administradors. */
export async function requireCuinaCentralAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { ok: false as const, res: NextResponse.json({ error: 'No autoritzat' }, { status: 401 }) }
  }
  const user = session.user as CuinaCentralSessionUser
  if (normalizeRole(user.role) !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Accés restringit a administradors' }, { status: 403 }) }
  }
  return { ok: true as const, user }
}

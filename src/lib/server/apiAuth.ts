/**
 * Autenticació reutilitzable per a rutes App Router (`route.ts`).
 * Patró: migrar rutes a poc a poc; les que encara no l’usen no canvien.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { Session } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { normalizeRole, type Role } from '@/lib/roles'

export type SessionUserForApi = {
  id: string
  name?: string | null
  email?: string | null
  role?: string
  department?: string
}

export type AuthSuccess = {
  ok: true
  session: Session
  user: SessionUserForApi
  role: Role
}

export type AuthFailure = { ok: false; res: NextResponse }

/** 401 si no hi ha sessió vàlida amb id. */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const raw = session.user as SessionUserForApi
  const id = String(raw.id ?? '').trim()
  if (!id) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return {
    ok: true,
    session: session as unknown as Session,
    user: { ...raw, id },
    role: normalizeRole(raw.role),
  }
}

/**
 * 403 si el rol no és un dels permesos.
 * @returns `null` si OK, o `AuthFailure` per retornar des del handler.
 */
export function requireRoles(auth: AuthSuccess, allowed: readonly Role[]): AuthFailure | null {
  if (!allowed.includes(auth.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return null
}

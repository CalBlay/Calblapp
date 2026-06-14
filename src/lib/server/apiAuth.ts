/**
 * Autenticació reutilitzable per a rutes App Router (`route.ts`).
 * Patró: migrar rutes a poc a poc; les que encara no l’usen no canvien.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/server/authOptions'
import type { AccessUser } from '@/lib/accessControl'
import { normalizeRole, type Role } from '@/lib/roles'

export type SessionUserForApi = {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean | null
  isDepartmentRobaLead?: boolean | null
  robaLinkedPersonnelId?: string | null
  opsProjectsConfigurable?: boolean | null
  isTransportLead?: boolean | null
}

export type AuthenticatedApiUser = AccessUser & {
  id: string
  name?: string | null
  email?: string | null
}

export type AuthSuccess = {
  ok: true
  session: Session
  user: AuthenticatedApiUser
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
  const user: AuthenticatedApiUser = {
    id,
    name: raw.name ?? null,
    email: raw.email ?? null,
    role: raw.role ?? undefined,
    department: raw.department ?? undefined,
    canRespondSurveys:
      typeof raw.canRespondSurveys === 'boolean' ? raw.canRespondSurveys : undefined,
    isDepartmentRobaLead:
      typeof raw.isDepartmentRobaLead === 'boolean' ? raw.isDepartmentRobaLead : undefined,
    robaLinkedPersonnelId: raw.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof raw.opsProjectsConfigurable === 'boolean' ? raw.opsProjectsConfigurable : undefined,
    isTransportLead:
      typeof raw.isTransportLead === 'boolean' ? raw.isTransportLead : undefined,
  }
  return {
    ok: true,
    session: session as unknown as Session,
    user,
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

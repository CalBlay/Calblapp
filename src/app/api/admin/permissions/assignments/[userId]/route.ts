import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole, type Role } from '@/lib/roles'

type AssignmentOverride = {
  permission: string
  effect: 'allow' | 'deny'
  scope: 'client' | 'centre' | 'project'
  scopeId?: string | null
  note?: string | null
}

type UserAccessAssignment = {
  userId: string
  name?: string
  base?: { role?: Role; department?: string | null }
  permissionSets?: string[]
  overrides?: AssignmentOverride[]
  updatedAt?: string
  updatedBy?: string
}

async function getUserName(userId: string): Promise<string | undefined> {
  const uSnap = await firestoreAdmin.collection('users').doc(userId).get()
  if (!uSnap.exists) return undefined
  const data = uSnap.data() as Record<string, unknown>
  return typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const { userId } = await ctx.params
  const id = String(userId || '').trim()
  if (!id) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const ref = firestoreAdmin.collection('user_access_assignments').doc(id)
  const [snap, name] = await Promise.all([ref.get(), getUserName(id)])

  if (!snap.exists) {
    return NextResponse.json({
      userId: id,
      name,
      base: { role: 'treballador', department: null },
      permissionSets: [],
      overrides: [],
    } satisfies UserAccessAssignment)
  }

  const assignment = snap.data() as UserAccessAssignment
  return NextResponse.json({ ...assignment, userId: id, name } satisfies UserAccessAssignment)
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const { userId } = await ctx.params
  const id = String(userId || '').trim()
  if (!id) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as Partial<UserAccessAssignment> | null
  if (!body) return NextResponse.json({ error: 'Bad Request' }, { status: 400 })

  const baseRole = normalizeRole(String(body.base?.role || 'treballador'))
  const departmentRaw = body.base?.department
  const department =
    departmentRaw === null || departmentRaw === undefined ? null : String(departmentRaw).trim()

  const permissionSets = Array.isArray(body.permissionSets)
    ? body.permissionSets.map(String).map((s) => s.trim()).filter(Boolean)
    : []

  const overrides = Array.isArray(body.overrides)
    ? body.overrides
        .map((o) => ({
          permission: String((o as any)?.permission || '').trim(),
          effect: (String((o as any)?.effect || 'allow') === 'deny' ? 'deny' : 'allow') as
            | 'allow'
            | 'deny',
          scope: (['client', 'centre', 'project'].includes(String((o as any)?.scope))
            ? String((o as any)?.scope)
            : 'client') as 'client' | 'centre' | 'project',
          scopeId: (o as any)?.scopeId ? String((o as any)?.scopeId).trim() : null,
          note: (o as any)?.note ? String((o as any)?.note).trim() : null,
        }))
        .filter((o) => o.permission)
    : []

  const ref = firestoreAdmin.collection('user_access_assignments').doc(id)
  const next: UserAccessAssignment = {
    userId: id,
    base: { role: baseRole, department },
    permissionSets,
    overrides,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.user.id,
  }

  await ref.set(next, { merge: true })

  return NextResponse.json({ ok: true })
}


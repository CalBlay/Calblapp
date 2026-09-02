import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { normalizeRole, type Role } from '@/lib/roles'
import { buildBootstrapAssignmentUpdate } from '@/lib/permissions/bootstrapAssignments'
import { parseOverrideInput } from '@/lib/permissions/parseOverrideInput'
import type { AssignmentOverride } from '@/lib/permissions/types'

type UserAccessAssignment = {
  userId: string
  name?: string
  base?: { role?: Role; department?: string | null }
  permissionSets?: string[]
  overrides?: AssignmentOverride[]
  updatedAt?: string
  updatedBy?: string
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
  const [snap, userSnap] = await Promise.all([
    ref.get(),
    firestoreAdmin.collection('users').doc(id).get(),
  ])
  const userData = (userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >
  const name = typeof userData.name === 'string' && userData.name.trim() ? userData.name.trim() : undefined

  if (!snap.exists) {
    const base = buildBootstrapAssignmentUpdate(
      {
        id,
        role: userData.role,
        department: userData.department,
      },
      auth.user.id,
      new Date().toISOString()
    )?.base

    return NextResponse.json({
      userId: id,
      name,
      base: base ?? { role: 'treballador', department: null },
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
        .map(parseOverrideInput)
        .filter((o): o is AssignmentOverride => o != null)
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


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

function parseOverrideInput(raw: unknown): AssignmentOverride | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const permission = String(o.permission ?? '').trim()
  if (!permission) return null
  const effect: AssignmentOverride['effect'] =
    String(o.effect ?? 'allow') === 'deny' ? 'deny' : 'allow'
  const scopeRaw = String(o.scope ?? 'client')
  const scope: AssignmentOverride['scope'] =
    scopeRaw === 'centre' || scopeRaw === 'project' ? scopeRaw : 'client'
  const scopeId =
    o.scopeId != null && o.scopeId !== '' ? String(o.scopeId).trim() : null
  const note = o.note != null && o.note !== '' ? String(o.note).trim() : null
  return { permission, effect, scope, scopeId, note }
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


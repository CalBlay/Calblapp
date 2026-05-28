import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { getVisibleModules, type AccessUser } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

type EffectiveRow = {
  path: string
  level: 'module' | 'submodule'
  baseView: boolean
  baseEdit: boolean
}

type EffectiveResponse = {
  rows: EffectiveRow[]
}

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])

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

  const uSnap = await firestoreAdmin.collection('users').doc(id).get()
  const u = (uSnap.exists ? (uSnap.data() as Record<string, unknown>) : {}) as Record<string, unknown>

  const accessUser: AccessUser = {
    role: typeof u.role === 'string' ? u.role : undefined,
    department: typeof u.department === 'string' ? u.department : undefined,
    canRespondSurveys: Boolean(u.canRespondSurveys),
    isDepartmentRobaLead: Boolean(u.isDepartmentRobaLead),
    robaLinkedPersonnelId: typeof u.robaLinkedPersonnelId === 'string' ? u.robaLinkedPersonnelId : null,
    opsProjectsConfigurable: typeof u.opsProjectsConfigurable === 'boolean' ? u.opsProjectsConfigurable : undefined,
  }

  const roleNorm = normalizeRole(accessUser.role)
  const canEditByRole = EDIT_ROLES.has(roleNorm)

  const visibleModules = getVisibleModules(accessUser)
  const visiblePaths = new Set<string>()
  for (const mod of visibleModules) {
    visiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) {
      visiblePaths.add(sub.path)
    }
  }

  const rows: EffectiveRow[] = []
  for (const mod of visibleModules) {
    rows.push({
      path: mod.path,
      level: 'module',
      baseView: true,
      baseEdit: canEditByRole,
    })
    for (const sub of mod.submodules || []) {
      rows.push({
        path: sub.path,
        level: 'submodule',
        baseView: true,
        baseEdit: canEditByRole,
      })
    }
  }

  // Incloure també paths no visibles com baseView=false? (per ara no: matriu = mòduls del sistema)
  // Aquesta ruta serveix per “marcar per defecte” segons lògica actual.

  const res: EffectiveResponse = { rows }
  return NextResponse.json(res)
}


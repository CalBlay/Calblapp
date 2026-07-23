import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { buildBootstrapAssignmentUpdate } from '@/lib/permissions/bootstrapAssignments'
import { buildEffectiveBaseMap, baseForPath } from '@/lib/permissions/effectiveBase'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import { getClientOverrideEffect } from '@/lib/permissions/overrideState'
import type { AssignmentOverride, UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { PERM } from '@/lib/permissionKeys'
import type { AccessUser } from '@/lib/accessControl'
import type { Role } from '@/lib/roles'

type AuditUserRow = {
  id: string
  name?: string
  email?: string
  role?: string
  department?: string
  assignment: {
    base: { role?: Role; department?: string | null }
    permissionSets: string[]
    overrides: AssignmentOverride[]
  }
  audit: {
    view: boolean
    edit: boolean
    baseView: boolean
    baseEdit: boolean
    viewOverride: 'allow' | 'deny' | null
    editOverride: 'allow' | 'deny' | null
  }
}

function buildAccessUser(data: Record<string, unknown>): AccessUser {
  return {
    role: typeof data.role === 'string' ? data.role : undefined,
    department: typeof data.department === 'string' ? data.department : undefined,
    canRespondSurveys: Boolean(data.canRespondSurveys),
    isDepartmentRobaLead: Boolean(data.isDepartmentRobaLead),
    robaLinkedPersonnelId:
      typeof data.robaLinkedPersonnelId === 'string' ? data.robaLinkedPersonnelId : null,
    opsProjectsConfigurable:
      typeof data.opsProjectsConfigurable === 'boolean' ? data.opsProjectsConfigurable : undefined,
    isTransportLead: Boolean(data.isTransportLead),
  }
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const { searchParams } = new URL(req.url)
  const path = String(searchParams.get('path') || '').trim()
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 })
  }

  const [usersSnap, assignmentsSnap] = await Promise.all([
    firestoreAdmin.collection('users').limit(500).get(),
    firestoreAdmin.collection('user_access_assignments').get(),
  ])

  const assignmentsByUserId = new Map<string, UserAccessAssignmentDoc>()
  for (const doc of assignmentsSnap.docs) {
    assignmentsByUserId.set(doc.id, doc.data() as UserAccessAssignmentDoc)
  }

  const users: AuditUserRow[] = usersSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>
    const accessUser = buildAccessUser(data)
    const assignment = assignmentsByUserId.get(doc.id) ?? null
    const baseMap = buildEffectiveBaseMap(accessUser)
    const base = baseForPath(baseMap, path)
    const viewMap = buildUiViewMap(accessUser, assignment)
    const effectiveView = viewMap[path] === true
    const viewOverride = getClientOverrideEffect(assignment?.overrides ?? [], PERM.view(path))
    const editOverride = getClientOverrideEffect(assignment?.overrides ?? [], PERM.edit(path))
    const effectiveEdit =
      editOverride === 'allow' ? true : editOverride === 'deny' ? false : effectiveView && base.edit

    const fallbackAssignment =
      assignment ??
      ({
        base:
          buildBootstrapAssignmentUpdate(
            {
              id: doc.id,
              role: accessUser.role,
              department: accessUser.department,
            },
            auth.user.id,
            new Date().toISOString()
          )?.base ?? { role: 'treballador', department: null },
        permissionSets: [],
        overrides: [],
      } satisfies NonNullable<UserAccessAssignmentDoc>)

    return {
      id: doc.id,
      name: typeof data.name === 'string' ? data.name : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      role: accessUser.role,
      department: accessUser.department,
      assignment: {
        base: fallbackAssignment.base ?? { role: 'treballador', department: null },
        permissionSets: Array.isArray(fallbackAssignment.permissionSets)
          ? fallbackAssignment.permissionSets.map(String)
          : [],
        overrides: Array.isArray(fallbackAssignment.overrides) ? fallbackAssignment.overrides : [],
      },
      audit: {
        view: effectiveView,
        edit: effectiveEdit,
        baseView: base.view,
        baseEdit: base.edit,
        viewOverride,
        editOverride,
      },
    }
  })

  users.sort((a, b) =>
    String(a.name || a.email || a.id).localeCompare(String(b.name || b.email || b.id), 'ca', {
      sensitivity: 'base',
    })
  )

  return NextResponse.json({ users })
}

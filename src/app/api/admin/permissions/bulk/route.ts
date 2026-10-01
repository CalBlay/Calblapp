import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { buildBootstrapAssignmentUpdate } from '@/lib/permissions/bootstrapAssignments'
import { parseBulkPermissionOperation } from '@/lib/permissions/bulkPermissionUpdate'
import { applyOverrideEffects } from '@/lib/permissions/overrideState'
import { parseOverrideInput } from '@/lib/permissions/parseOverrideInput'
import type { AssignmentOverride, UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { SPACES_REQUESTS_MANAGE_PERM } from '@/lib/spacesPermissions'
import { syncSpaceRequestManagerMembershipForUser } from '@/lib/spaces/spaceRequests.server'

type BulkRequest = {
  userIds?: unknown
  operation?: unknown
}

const MAX_USERS_PER_REQUEST = 500

export async function PUT(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const body = (await req.json().catch(() => null)) as BulkRequest | null
  const userIds = Array.isArray(body?.userIds)
    ? [...new Set(body.userIds.map(String).map((id) => id.trim()).filter(Boolean))]
    : []
  const updates = parseBulkPermissionOperation(body?.operation)

  if (userIds.length === 0 || userIds.length > MAX_USERS_PER_REQUEST || !updates) {
    return NextResponse.json(
      { error: `Peticio no valida. Selecciona entre 1 i ${MAX_USERS_PER_REQUEST} usuaris.` },
      { status: 400 }
    )
  }

  const userRefs = userIds.map((id) => firestoreAdmin.collection('users').doc(id))
  const assignmentRefs = userIds.map((id) =>
    firestoreAdmin.collection('user_access_assignments').doc(id)
  )
  const [userSnaps, assignmentSnaps] = await Promise.all([
    firestoreAdmin.getAll(...userRefs),
    firestoreAdmin.getAll(...assignmentRefs),
  ])

  const missingUserIds = userSnaps.filter((snap) => !snap.exists).map((snap) => snap.id)
  if (missingUserIds.length > 0) {
    return NextResponse.json(
      { error: `No s'han trobat ${missingUserIds.length} usuaris.` },
      { status: 404 }
    )
  }

  const now = new Date().toISOString()
  const batch = firestoreAdmin.batch()

  userSnaps.forEach((userSnap, index) => {
    const userData = userSnap.data() as Record<string, unknown>
    const assignmentSnap = assignmentSnaps[index]
    const assignment = assignmentSnap.exists
      ? (assignmentSnap.data() as UserAccessAssignmentDoc)
      : null
    const currentOverrides = Array.isArray(assignment?.overrides)
      ? assignment.overrides
          .map(parseOverrideInput)
          .filter((override): override is AssignmentOverride => override !== null)
      : []
    const fallbackBase = buildBootstrapAssignmentUpdate(
      {
        id: userSnap.id,
        role: userData.role,
        department: userData.department,
      },
      auth.user.id,
      now
    )?.base ?? { role: 'treballador' as const, department: null }

    batch.set(
      assignmentRefs[index],
      {
        userId: userSnap.id,
        base: assignment?.base ?? fallbackBase,
        permissionSets: Array.isArray(assignment?.permissionSets)
          ? assignment.permissionSets.map(String).filter(Boolean)
          : [],
        overrides: applyOverrideEffects(currentOverrides, updates, 'Bulk permissions UI'),
        updatedAt: now,
        updatedBy: auth.user.id,
      },
      { merge: true }
    )
  })

  await batch.commit()

  if (updates.some((update) => update.permission === SPACES_REQUESTS_MANAGE_PERM)) {
    for (let index = 0; index < userIds.length; index += 20) {
      const userIdChunk = userIds.slice(index, index + 20)
      const syncResults = await Promise.allSettled(
        userIdChunk.map((userId) => syncSpaceRequestManagerMembershipForUser(userId))
      )
      syncResults.forEach((result, chunkIndex) => {
        if (result.status === 'rejected') {
          console.error(
            `[permissions] space request membership sync failed for ${userIdChunk[chunkIndex]}:`,
            result.reason
          )
        }
      })
    }
  }

  return NextResponse.json({ ok: true, updated: userIds.length })
}

import { NextResponse } from 'next/server'
import { requireAuth, requireRoles } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { buildBootstrapAssignmentUpdate } from '@/lib/permissions/bootstrapAssignments'
import {
  cloneAssignmentOverrides,
  extractUserConfigTemplate,
  parsePermissionCopySelection,
} from '@/lib/permissions/userConfigTemplate'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { syncSpaceRequestManagerMembershipForUser } from '@/lib/spaces/spaceRequests.server'

type CopyPermissionsRequest = {
  sourceUserId?: unknown
  targetUserIds?: unknown
}

export async function PUT(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  const denied = requireRoles(auth, ['admin'])
  if (denied) return denied.res

  const body = (await req.json().catch(() => null)) as CopyPermissionsRequest | null
  const selection = parsePermissionCopySelection(body?.sourceUserId, body?.targetUserIds)
  if (!selection) {
    return NextResponse.json(
      { error: 'Selecciona un usuari origen i entre 1 i 500 destinataris diferents.' },
      { status: 400 }
    )
  }

  const sourceUserRef = firestoreAdmin.collection('users').doc(selection.sourceUserId)
  const sourceAssignmentRef = firestoreAdmin
    .collection('user_access_assignments')
    .doc(selection.sourceUserId)
  const targetUserRefs = selection.targetUserIds.map((id) =>
    firestoreAdmin.collection('users').doc(id)
  )
  const targetAssignmentRefs = selection.targetUserIds.map((id) =>
    firestoreAdmin.collection('user_access_assignments').doc(id)
  )

  const [sourceUserSnap, sourceAssignmentSnap, targetUserSnaps, targetAssignmentSnaps] =
    await Promise.all([
      sourceUserRef.get(),
      sourceAssignmentRef.get(),
      firestoreAdmin.getAll(...targetUserRefs),
      firestoreAdmin.getAll(...targetAssignmentRefs),
    ])

  if (!sourceUserSnap.exists) {
    return NextResponse.json({ error: 'Usuari origen no trobat.' }, { status: 404 })
  }

  const missingTargets = targetUserSnaps.filter((snap) => !snap.exists)
  if (missingTargets.length > 0) {
    return NextResponse.json(
      { error: `No s’han trobat ${missingTargets.length} usuaris destinataris.` },
      { status: 404 }
    )
  }

  const sourceAssignment = sourceAssignmentSnap.exists
    ? (sourceAssignmentSnap.data() as UserAccessAssignmentDoc)
    : null
  const template = extractUserConfigTemplate(
    selection.sourceUserId,
    sourceUserSnap.data() as Record<string, unknown>,
    sourceAssignment
  )
  const now = new Date().toISOString()
  const batch = firestoreAdmin.batch()

  targetUserSnaps.forEach((targetUserSnap, index) => {
    const targetUserData = targetUserSnap.data() as Record<string, unknown>
    const targetAssignmentSnap = targetAssignmentSnaps[index]
    const targetAssignment = targetAssignmentSnap.exists
      ? (targetAssignmentSnap.data() as UserAccessAssignmentDoc)
      : null
    const fallbackBase = buildBootstrapAssignmentUpdate(
      {
        id: targetUserSnap.id,
        role: targetUserData.role,
        department: targetUserData.department,
      },
      auth.user.id,
      now
    )?.base ?? { role: 'treballador' as const, department: null }

    batch.set(
      targetAssignmentRefs[index],
      {
        userId: targetUserSnap.id,
        base: targetAssignment?.base ?? fallbackBase,
        permissionSets: Array.isArray(targetAssignment?.permissionSets)
          ? targetAssignment.permissionSets.map(String).filter(Boolean)
          : [],
        overrides: cloneAssignmentOverrides(template.overrides),
        updatedAt: now,
        updatedBy: auth.user.id,
        copiedFromUserId: selection.sourceUserId,
        copiedAt: now,
      },
      { merge: true }
    )
  })

  await batch.commit()

  for (let index = 0; index < selection.targetUserIds.length; index += 20) {
    const chunk = selection.targetUserIds.slice(index, index + 20)
    const results = await Promise.allSettled(
      chunk.map((userId) => syncSpaceRequestManagerMembershipForUser(userId))
    )
    results.forEach((result, resultIndex) => {
      if (result.status === 'rejected') {
        console.error(
          `[permissions] copied permission membership sync failed for ${chunk[resultIndex]}:`,
          result.reason
        )
      }
    })
  }

  return NextResponse.json({
    ok: true,
    sourceName: template.sourceName,
    updated: selection.targetUserIds.length,
  })
}

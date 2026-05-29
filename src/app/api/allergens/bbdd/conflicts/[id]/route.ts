export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import type { SessionUserForApi } from '@/lib/server/apiAuth'
import { requireAuth } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath, isAllowedByClientOverride } from '@/lib/server/permissions'
import { PERM } from '@/lib/permissionKeys'
import type { AccessUser } from '@/lib/accessControl'

const ALLERGENS_BBDD_PATH = '/menu/allergens/bbdd'

function buildAccessUser(authUser: SessionUserForApi): AccessUser & { id: string } {
  return {
    id: authUser.id,
    role: authUser.role,
    department: authUser.department,
    canRespondSurveys: Boolean((authUser as { canRespondSurveys?: boolean }).canRespondSurveys),
    isDepartmentRobaLead: Boolean((authUser as { isDepartmentRobaLead?: boolean }).isDepartmentRobaLead),
    robaLinkedPersonnelId: (authUser as { robaLinkedPersonnelId?: string | null }).robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof (authUser as { opsProjectsConfigurable?: boolean }).opsProjectsConfigurable === 'boolean'
        ? (authUser as { opsProjectsConfigurable?: boolean }).opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean((authUser as { isTransportLead?: boolean }).isTransportLead),
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res

    const accessUser = buildAccessUser(auth.user)
    const canView = await canViewUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
    if (!canView) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const canEdit = await canEditUiPath({ user: accessUser, path: ALLERGENS_BBDD_PATH })
    const importOverride = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action(ALLERGENS_BBDD_PATH, 'import'),
    })
    const replaceOverride = await isAllowedByClientOverride({
      userId: auth.user.id,
      role: auth.user.role,
      permission: PERM.action(ALLERGENS_BBDD_PATH, 'replace'),
    })

    if (!canEdit && importOverride !== true && replaceOverride !== true) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await context.params
    const conflictId = String(id || '').trim()
    if (!conflictId) {
      return NextResponse.json({ ok: false, error: 'Missing conflict id' }, { status: 400 })
    }

    await firestoreAdmin.collection('allergens_import_conflicts').doc(conflictId).delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allergens/bbdd/conflicts DELETE]', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}

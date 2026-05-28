import { NextResponse } from 'next/server'
import type { AccessUser } from '@/lib/accessControl'
import type { AuthSuccess } from '@/lib/server/apiAuth'
import { canEditUiPath, canViewUiPath } from '@/lib/server/permissions'
import { ROBA_WORKFLOW_UI_PATHS } from '@/lib/robaPersonalPermissions'

export function accessUserFromAuth(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean
  isDepartmentRobaLead?: boolean
  robaLinkedPersonnelId?: string | null
  isTransportLead?: boolean
}): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role,
    department: user.department,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    isTransportLead: Boolean(user.isTransportLead),
  }
}

export async function requireRobaTabView(
  auth: AuthSuccess,
  subpath: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  return canViewUiPath({ user: accessUser, path: subpath })
}

export async function requireRobaTabEdit(
  auth: AuthSuccess,
  subpath: string
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  return canEditUiPath({ user: accessUser, path: subpath })
}

export async function requireRobaWorkflowView(auth: AuthSuccess): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  for (const path of ROBA_WORKFLOW_UI_PATHS) {
    if (await canViewUiPath({ user: accessUser, path })) return true
  }
  return false
}

export async function requireRobaAnyTabView(
  auth: AuthSuccess,
  paths: string[]
): Promise<boolean> {
  const accessUser = accessUserFromAuth(
    auth.user as Parameters<typeof accessUserFromAuth>[0]
  )
  for (const path of paths) {
    if (await canViewUiPath({ user: accessUser, path })) return true
  }
  return false
}

export function robaTabForbiddenResponse(): NextResponse {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

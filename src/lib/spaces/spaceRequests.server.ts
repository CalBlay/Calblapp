import 'server-only'

import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { AccessUser } from '@/lib/accessControl'
import {
  SPACES_ACTION,
  SPACES_BBDD_PATH,
  SPACES_LEGACY_CONSULTA_ACTION,
  SPACES_REQUESTS_MANAGE_PERM,
  SPACES_UI_PATH,
} from '@/lib/spacesPermissions'
import { isUiPermissionGranted } from '@/lib/server/permissions'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import { buildEffectiveBaseMap, baseForPath } from '@/lib/permissions/effectiveBase'
import { getClientOverrideEffect } from '@/lib/permissions/overrideState'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'

export type SpaceRequestManager = { id: string; name: string }

function accessUserFromDoc(id: string, data: Record<string, unknown>): AccessUser & { id: string } {
  return {
    id,
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

export async function canManageSpaceRequests(user: AccessUser & { id: string }): Promise<boolean> {
  return isUiPermissionGranted({ user, permission: SPACES_REQUESTS_MANAGE_PERM })
}

export function hasEffectiveSpaceRequestManagerAccess(
  user: AccessUser,
  assignment: UserAccessAssignmentDoc
): boolean {
  if (normalizeRole(user.role) === 'admin') return true

  const overrides = assignment?.overrides ?? []
  const viewMap = buildUiViewMap(user, assignment)
  const legacyView = getClientOverrideEffect(
    overrides,
    PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.BBDD)
  )
  const canView = viewMap[SPACES_BBDD_PATH] === true || legacyView === 'allow'
  if (!canView) return false

  const baseEdit = baseForPath(buildEffectiveBaseMap(user), SPACES_BBDD_PATH).edit
  const editEffect = getClientOverrideEffect(overrides, PERM.edit(SPACES_BBDD_PATH))
  const parentEditEffect = getClientOverrideEffect(overrides, PERM.edit(SPACES_UI_PATH))
  const canEdit = editEffect === 'allow'
    ? true
    : editEffect === 'deny'
      ? false
      : parentEditEffect === 'allow'
        ? true
        : parentEditEffect === 'deny'
          ? false
          : baseEdit
  if (!canEdit) return false

  const requiredActions = [SPACES_ACTION.BBDD_CREATE, SPACES_ACTION.BBDD_UPDATE]
  const canCreateAndUpdate = requiredActions.every((action) => {
    const primary = getClientOverrideEffect(
      overrides,
      PERM.action(SPACES_BBDD_PATH, action)
    )
    const legacy = getClientOverrideEffect(overrides, PERM.action(SPACES_UI_PATH, action))
    return (primary ?? legacy) !== 'deny'
  })
  const manageEffect = getClientOverrideEffect(overrides, SPACES_REQUESTS_MANAGE_PERM)
  return canCreateAndUpdate && manageEffect === 'allow'
}

export async function resolveSpaceRequestManagers(): Promise<SpaceRequestManager[]> {
  const [usersSnap, assignmentsSnap] = await Promise.all([
    db.collection('users').limit(500).get(),
    db.collection('user_access_assignments').get(),
  ])
  const assignmentByUserId = new Map(
    assignmentsSnap.docs.map((doc) => [doc.id, doc.data() as UserAccessAssignmentDoc])
  )
  const results = usersSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>
    const user = accessUserFromDoc(doc.id, data)
    if (!hasEffectiveSpaceRequestManagerAccess(user, assignmentByUserId.get(doc.id) ?? null)) {
      return null
    }
    return {
      id: doc.id,
      name: String(data.name || data.email || 'Gestor Espais').trim(),
    }
  })
  return results.filter((row): row is SpaceRequestManager => row !== null)
}

export async function reconcileSpaceRequestChannelMembers(channelId: string): Promise<void> {
  const normalizedChannelId = String(channelId || '').trim()
  if (!normalizedChannelId) return

  const channelRef = db.collection('channels').doc(normalizedChannelId)
  const [channelSnap, currentMembersSnap, managers] = await Promise.all([
    channelRef.get(),
    db.collection('channelMembers').where('channelId', '==', normalizedChannelId).get(),
    resolveSpaceRequestManagers(),
  ])
  if (!channelSnap.exists || String(channelSnap.get('source') || '') !== 'spaces') return

  const requesterId = String(channelSnap.get('requesterUserId') || '').trim()
  const requesterName = String(channelSnap.get('requesterUserName') || 'Sol·licitant').trim()
  const managerById = new Map(managers.map((manager) => [manager.id, manager.name]))
  const allowedIds = new Set(managerById.keys())
  if (requesterId) allowedIds.add(requesterId)

  const batch = db.batch()
  let operations = 0
  for (const memberDoc of currentMembersSnap.docs) {
    const memberId = String(memberDoc.get('userId') || '').trim()
    if (memberId && allowedIds.has(memberId)) continue
    batch.delete(memberDoc.ref)
    operations += 1
  }

  const now = Date.now()
  for (const [managerId, managerName] of managerById) {
    batch.set(db.collection('channelMembers').doc(`${normalizedChannelId}_${managerId}`), {
      channelId: normalizedChannelId,
      userId: managerId,
      userName: managerName,
      role: 'manager',
      joinedAt: now,
    }, { merge: true })
    operations += 1
  }
  if (requesterId && !managerById.has(requesterId)) {
    batch.set(db.collection('channelMembers').doc(`${normalizedChannelId}_${requesterId}`), {
      channelId: normalizedChannelId,
      userId: requesterId,
      userName: requesterName,
      role: 'member',
      joinedAt: now,
    }, { merge: true })
    operations += 1
  }

  if (operations > 0) await batch.commit()
}

/** Manté les sales existents alineades quan Settings canvia els permisos d'un usuari. */
export async function syncSpaceRequestManagerMembershipForUser(userId: string): Promise<void> {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return

  const [userSnap, channelsSnap] = await Promise.all([
    db.collection('users').doc(normalizedUserId).get(),
    db.collection('channels').where('source', '==', 'spaces').get(),
  ])
  if (!userSnap.exists || channelsSnap.empty) return

  const userData = userSnap.data() as Record<string, unknown>
  const canManage = await canManageSpaceRequests(accessUserFromDoc(normalizedUserId, userData))
  const userName = String(userData.name || userData.email || 'Gestor Espais').trim()
  const batch = db.batch()
  let operations = 0

  for (const channelDoc of channelsSnap.docs) {
    const channel = channelDoc.data() as Record<string, unknown>
    const requesterId = String(channel.requesterUserId || '').trim()
    const memberRef = db.collection('channelMembers').doc(`${channelDoc.id}_${normalizedUserId}`)

    if (canManage) {
      batch.set(memberRef, {
        channelId: channelDoc.id,
        userId: normalizedUserId,
        userName,
        role: 'manager',
        joinedAt: Date.now(),
      }, { merge: true })
      operations += 1
    } else if (requesterId === normalizedUserId) {
      batch.set(memberRef, { role: 'member' }, { merge: true })
      operations += 1
    } else {
      batch.delete(memberRef)
      operations += 1
    }
  }

  if (operations > 0) await batch.commit()
}

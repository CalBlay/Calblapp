import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import {
  listAllowedPreparationWarehouses,
  PREPARATION_UI_PATH,
  preparationWarehousePerm,
} from '@/lib/logistics/preparationPermissions'
import {
  PREPARATION_WAREHOUSE_CODES,
  type PreparationWarehouseCode,
} from '@/lib/logistics/preparationWarehouses'
import { normalizeRole } from '@/lib/roles'

function userDocToAccessUser(data: Record<string, unknown>) {
  return {
    role: String(data.role || ''),
    department: String(data.department || ''),
    canRespondSurveys:
      typeof data.canRespondSurveys === 'boolean' ? data.canRespondSurveys : undefined,
    isDepartmentRobaLead:
      typeof data.isDepartmentRobaLead === 'boolean' ? data.isDepartmentRobaLead : undefined,
    robaLinkedPersonnelId:
      typeof data.robaLinkedPersonnelId === 'string' ? data.robaLinkedPersonnelId : null,
    opsProjectsConfigurable:
      typeof data.opsProjectsConfigurable === 'boolean' ? data.opsProjectsConfigurable : undefined,
    isTransportLead:
      typeof data.isTransportLead === 'boolean' ? data.isTransportLead : undefined,
  }
}

function buildActionsFromAssignment(assignment: UserAccessAssignmentDoc | null): Record<string, boolean> {
  const actions: Record<string, boolean> = {}
  const overrides = assignment?.overrides || []
  for (const warehouse of PREPARATION_WAREHOUSE_CODES) {
    const key = preparationWarehousePerm(warehouse)
    const found = overrides.find((item) => item.permission === key && item.scope !== 'project')
    if (found?.effect === 'allow') actions[key] = true
    if (found?.effect === 'deny') actions[key] = false
  }
  return actions
}

export async function listPreparationWarehousesForUser(userId: string, role: string) {
  const normalizedRole = normalizeRole(role)
  if (normalizedRole === 'admin' || normalizedRole === 'direccio' || normalizedRole === 'cap') {
    return [...PREPARATION_WAREHOUSE_CODES]
  }

  const [userSnap, assignmentSnap] = await Promise.all([
    db.collection('users').doc(userId).get(),
    db.collection('user_access_assignments').doc(userId).get(),
  ])

  if (!userSnap.exists) return [] as PreparationWarehouseCode[]

  const accessUser = userDocToAccessUser(userSnap.data() as Record<string, unknown>)
  const uiMap = buildUiViewMap(
    accessUser,
    assignmentSnap.exists ? (assignmentSnap.data() as UserAccessAssignmentDoc) : null
  )
  if (uiMap[PREPARATION_UI_PATH] !== true) return [] as PreparationWarehouseCode[]

  const actions = buildActionsFromAssignment(
    assignmentSnap.exists ? (assignmentSnap.data() as UserAccessAssignmentDoc) : null
  )

  return listAllowedPreparationWarehouses({ role: normalizedRole, actions })
}

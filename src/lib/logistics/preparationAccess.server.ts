import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { DECO_PREPARATION_UI_PATH } from '@/lib/decoTicketsPermissions'
import {
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

function listExplicitPreparationWarehouses(actions: Record<string, boolean>): PreparationWarehouseCode[] {
  return PREPARATION_WAREHOUSE_CODES.filter(
    (warehouse) => actions[preparationWarehousePerm(warehouse)] === true
  )
}

export async function listPreparationWarehousesForUser(
  userId: string,
  role: string,
  options: { scope?: 'deco' } = {}
) {
  const normalizedRole = normalizeRole(role)
  if (
    normalizedRole === 'admin' ||
    normalizedRole === 'supervisor_logistica' ||
    (normalizedRole === 'direccio' && options.scope !== 'deco')
  ) {
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
  const canPrepareDeco = uiMap[DECO_PREPARATION_UI_PATH] === true
  if (options.scope === 'deco' && canPrepareDeco) {
    return ['DECO'] as PreparationWarehouseCode[]
  }
  if (options.scope === 'deco') return [] as PreparationWarehouseCode[]

  const actions = buildActionsFromAssignment(
    assignmentSnap.exists ? (assignmentSnap.data() as UserAccessAssignmentDoc) : null
  )
  const allowed = new Set<PreparationWarehouseCode>()

  if (uiMap[PREPARATION_UI_PATH] === true) {
    for (const warehouse of listExplicitPreparationWarehouses(actions)) {
      allowed.add(warehouse)
    }
  }

  // La preparació oberta des d'Imatge-Deco reutilitza les mateixes API de fitxa,
  // catàleg i xat. El permís del mòdul Deco ha d'autoritzar només aquest magatzem,
  // sense obligar l'usuari a veure el mòdul de Logística.
  if (canPrepareDeco) allowed.add('DECO')

  return PREPARATION_WAREHOUSE_CODES.filter((warehouse) => allowed.has(warehouse))
}

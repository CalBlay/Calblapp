import { cache } from 'react'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { getVisibleModules, type AccessUser } from '@/lib/accessControl'
import {
  CALENDAR_EDIT_IMPLIED_ACTIONS,
  PERM,
  SPACES_EDIT_IMPLIED_ACTIONS,
  isEditPerm,
  isViewPerm,
  parseActionPermission,
  editPathFromPerm,
  viewPathFromPerm,
} from '@/lib/permissionKeys'
import {
  baseCanKeysHandoverReservaComercials,
  baseCanValidateReservaComercials,
  RESERVA_COMERCIALS_UI_PATH,
} from '@/lib/reservaComercialsPermissions'
import {
  PREPARATION_IMPORT_ACTION,
  PREPARATION_UI_PATH,
  isPreparationManagerRole,
} from '@/lib/logistics/preparationPermissions'
import {
  QUADRANTS_ACTION,
  QUADRANTS_UI_PATH,
  baseCanEditQuadrantsPremisses,
} from '@/lib/quadrantsPermissions'
import {
  SPACES_ACTION,
  SPACES_BBDD_PATH,
  SPACES_LEGACY_CONSULTA_ACTION,
  SPACES_PREMISSES_PATH,
  SPACES_RESERVES_PATH,
  SPACES_UI_PATH,
  baseCanDeleteSpacesBbdd,
  baseCanEditSpacesPremisses,
  baseCanMutateSpacesBbdd,
  isSpacesBbddActionPath,
} from '@/lib/spacesPermissions'
import { normalizeRole } from '@/lib/roles'
import {
  INCIDENTS_ACTION,
  INCIDENTS_CATEGORY_EDIT_PERM,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_QUADRE_PATH,
  INCIDENTS_TYPOLOGIES_MANAGE_PERM,
  INCIDENTS_UI_PATH,
  incidentsActionBaseAccess,
} from '@/lib/incidentsPermissions'
import {
  EVENTS_COMANDA_ACTION,
  EVENTS_COMANDA_CREATE_PERM,
  EVENTS_COMANDA_PREPARE_PERM,
  EVENTS_UI_PATH,
  EVENTS_WAREHOUSE_COMANDA_ONLY_PERM,
  eventsWarehouseComandaActionBaseAccess,
} from '@/lib/eventComandaPermissions'
import {
  baseCanAttachEventVisitVideo,
  EVENT_VISIT_VIDEO_ACTION,
} from '@/lib/eventVisitVideoPermissions'
import {
  MAINTENANCE_TICKETS_ACTION,
  MAINTENANCE_TICKETS_DELETE_PERM,
  MAINTENANCE_TICKETS_EXTERNALIZE_PERM,
  MAINTENANCE_TICKETS_INBOX_PERM,
  MAINTENANCE_TICKETS_MANAGE_PERM,
  MAINTENANCE_TICKETS_REOPEN_PERM,
  MAINTENANCE_TICKETS_UI_PATH,
  MAINTENANCE_TICKETS_VALIDATE_PERM,
} from '@/lib/maintenanceTicketsPermissions'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])

type OverrideEffect = 'allow' | 'deny'

type AssignmentOverride = {
  permission?: string
  effect?: OverrideEffect
  scope?: 'client' | 'centre' | 'project'
  scopeId?: string | null
}

type UserAccessAssignment = {
  overrides?: AssignmentOverride[]
}

const loadUserAccessAssignment = cache(async (userId: string): Promise<UserAccessAssignmentDoc> => {
  const id = String(userId || '').trim()
  if (!id) return null
  const snap = await firestoreAdmin.collection('user_access_assignments').doc(id).get()
  return snap.exists ? (snap.data() as UserAccessAssignmentDoc) : null
})

function isClientScopeOverride(o: AssignmentOverride | null | undefined) {
  return String(o?.scope || 'client') === 'client' && !String(o?.scopeId || '').trim()
}

function clientScopeOverrideEffect(o: AssignmentOverride): OverrideEffect {
  return o.effect === 'deny' ? 'deny' : 'allow'
}

/** One Firestore read per request per userId (React `cache` dedupes within the request). */
const loadClientScopeOverrideEffectsByPermission = cache(
  async (userId: string): Promise<Map<string, OverrideEffect>> => {
    const snap = await firestoreAdmin.collection('user_access_assignments').doc(String(userId)).get()
    const map = new Map<string, OverrideEffect>()
    if (!snap.exists) return map
    const data = snap.data() as UserAccessAssignment | undefined
    const list = Array.isArray(data?.overrides) ? data.overrides : []
    for (const o of list) {
      if (!isClientScopeOverride(o)) continue
      const permission = String(o?.permission || '').trim()
      if (!permission || map.has(permission)) continue
      map.set(permission, clientScopeOverrideEffect(o))
    }
    return map
  }
)

export async function getClientOverrideEffectForPermission(
  userId: string,
  permission: string
): Promise<OverrideEffect | null> {
  const map = await loadClientScopeOverrideEffectsByPermission(userId)
  return map.get(permission) ?? null
}

/**
 * Returns whether the user is allowed by override.
 * - **admin**: always true
 * - if override exists: allow/deny
 * - if no override: returns `null` (caller decides base policy)
 */
export async function isAllowedByClientOverride(params: {
  userId: string
  role?: string | null
  permission: string
}): Promise<boolean | null> {
  const roleNorm = normalizeRole(params.role || undefined)
  if (roleNorm === 'admin') return true
  const eff = await getClientOverrideEffectForPermission(params.userId, params.permission)
  if (eff === 'allow') return true
  if (eff === 'deny') return false

  const parsed = parseActionPermission(params.permission)
  if (
    parsed?.path === '/menu/calendar' &&
    CALENDAR_EDIT_IMPLIED_ACTIONS.has(parsed.action)
  ) {
    const editEff = await getClientOverrideEffectForPermission(
      params.userId,
      PERM.edit(parsed.path)
    )
    if (editEff === 'allow') return true
    if (editEff === 'deny') return false
  }

  if (parsed && SPACES_EDIT_IMPLIED_ACTIONS.has(parsed.action) && isSpacesBbddActionPath(parsed.path)) {
    const editEff = await getClientOverrideEffectForPermission(
      params.userId,
      PERM.edit(SPACES_BBDD_PATH)
    )
    if (editEff === 'allow') return true
    if (editEff === 'deny') return false
  }

  return null
}

/** Resol permís UI (override + edició implícita + política base rol/mòdul). */
export async function isUiPermissionGranted(params: {
  user: AccessUser & { id: string }
  permission: string
}): Promise<boolean> {
  const roleNorm = normalizeRole(params.user.role || undefined)
  if (roleNorm === 'admin') return true

  const override = await isAllowedByClientOverride({
    userId: params.user.id,
    role: params.user.role,
    permission: params.permission,
  })
  if (override === true) return true
  if (override === false) return false

  if (isViewPerm(params.permission)) {
    const path = viewPathFromPerm(params.permission)
    return path ? canViewUiPath({ user: params.user, path }) : false
  }

  if (isEditPerm(params.permission)) {
    return canEditUiPath({ user: params.user, path: editPathFromPerm(params.permission) || '' })
  }

  const parsed = parseActionPermission(params.permission)
  if (parsed?.path === RESERVA_COMERCIALS_UI_PATH) {
    const canView = await canViewUiPath({ user: params.user, path: parsed.path })
    if (!canView) return false
    if (parsed.action === 'request') return true
    if (parsed.action === 'validate') {
      return baseCanValidateReservaComercials({
        role: params.user.role,
        isTransportLead: params.user.isTransportLead,
      })
    }
    if (parsed.action === 'keys') {
      return baseCanKeysHandoverReservaComercials({
        role: params.user.role,
        department: params.user.department,
        isTransportLead: params.user.isTransportLead,
      })
    }
  }

  if (parsed?.path === PREPARATION_UI_PATH) {
    const canView = await canViewUiPath({ user: params.user, path: parsed.path })
    if (!canView) return false
    if (parsed.action === PREPARATION_IMPORT_ACTION) {
      return isPreparationManagerRole(params.user.role || '')
    }
  }

  if (parsed && (isSpacesBbddActionPath(parsed.path) || parsed.path === SPACES_UI_PATH)) {
    if (parsed.action === SPACES_LEGACY_CONSULTA_ACTION.RESERVES) {
      return canViewUiPath({ user: params.user, path: SPACES_RESERVES_PATH })
    }
    if (parsed.action === SPACES_LEGACY_CONSULTA_ACTION.BBDD) {
      return canViewUiPath({ user: params.user, path: SPACES_BBDD_PATH })
    }

    const canViewBbdd = await canViewUiPath({ user: params.user, path: SPACES_BBDD_PATH })
    if (!canViewBbdd) return false

    if (parsed.action === SPACES_ACTION.BBDD_EXPORT) return true

    if (parsed.action === SPACES_ACTION.BBDD_CREATE || parsed.action === SPACES_ACTION.BBDD_UPDATE) {
      const canEditBbdd = await canEditUiPath({ user: params.user, path: SPACES_BBDD_PATH })
      if (!canEditBbdd) return false
      return baseCanMutateSpacesBbdd(params.user)
    }

    if (parsed.action === SPACES_ACTION.BBDD_DELETE) {
      const canEditBbdd = await canEditUiPath({ user: params.user, path: SPACES_BBDD_PATH })
      if (!canEditBbdd) return false
      return baseCanDeleteSpacesBbdd(params.user)
    }

    if (parsed.action === SPACES_ACTION.PREMISSES_EDIT) {
      const canViewPremisses = await canViewUiPath({
        user: params.user,
        path: SPACES_PREMISSES_PATH,
      })
      if (!canViewPremisses) return false
      const canEditPremisses = await canEditUiPath({
        user: params.user,
        path: SPACES_PREMISSES_PATH,
      })
      if (!canEditPremisses) return false
      return baseCanEditSpacesPremisses(params.user)
    }
  }

  if (
    parsed?.path === SPACES_RESERVES_PATH &&
    parsed.action === SPACES_ACTION.RESERVES_MANUAL_CREATE
  ) {
    const canViewReserves = await canViewUiPath({
      user: params.user,
      path: SPACES_RESERVES_PATH,
    })
    if (!canViewReserves) return false
    return canEditUiPath({ user: params.user, path: SPACES_RESERVES_PATH })
  }

  if (parsed?.path === QUADRANTS_UI_PATH && parsed.action === QUADRANTS_ACTION.PREMISSES_EDIT) {
    const canView = await canViewUiPath({ user: params.user, path: QUADRANTS_UI_PATH })
    if (!canView) return false
    const canEdit = await canEditUiPath({ user: params.user, path: QUADRANTS_UI_PATH })
    if (!canEdit) return false
    return baseCanEditQuadrantsPremisses(params.user)
  }

  if (parsed?.path === INCIDENTS_UI_PATH) {
    const canViewIncidents = await canViewUiPath({ user: params.user, path: INCIDENTS_UI_PATH })
    const canEditIncidents = await canEditUiPath({ user: params.user, path: INCIDENTS_UI_PATH })
    const assignment = await loadUserAccessAssignment(params.user.id)
    const map = buildUiViewMap(params.user, assignment)
    const base = {
      canViewIncidents,
      canEditIncidents,
      canViewQuadrePath: map[INCIDENTS_QUADRE_PATH] === true,
    }

    if (parsed.action === INCIDENTS_ACTION.MEETING_MINUTES) {
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        INCIDENTS_MEETING_MINUTES_PERM
      )
      if (eff !== 'allow') return false
      return incidentsActionBaseAccess(params.user, base, INCIDENTS_ACTION.MEETING_MINUTES)
    }

    if (parsed.action === INCIDENTS_ACTION.COMMAND_BOARD) {
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        INCIDENTS_COMMAND_BOARD_PERM
      )
      if (eff !== 'allow') return false
      return incidentsActionBaseAccess(params.user, base, INCIDENTS_ACTION.COMMAND_BOARD)
    }

    if (parsed.action === INCIDENTS_ACTION.CATEGORY_EDIT) {
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        INCIDENTS_CATEGORY_EDIT_PERM
      )
      if (eff !== 'allow') return false
      return base.canViewIncidents && base.canEditIncidents
    }

    if (parsed.action === INCIDENTS_ACTION.TYPOLOGIES_MANAGE) {
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        INCIDENTS_TYPOLOGIES_MANAGE_PERM
      )
      if (eff !== 'allow') return false
      return base.canViewIncidents && base.canEditIncidents
    }
  }

  if (parsed?.path === EVENTS_UI_PATH) {
    if (parsed.action === EVENTS_COMANDA_ACTION.CREATE) {
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        EVENTS_COMANDA_CREATE_PERM
      )
      if (eff !== 'allow') return false
      const canViewEvents = await canViewUiPath({ user: params.user, path: EVENTS_UI_PATH })
      return eventsWarehouseComandaActionBaseAccess({ canViewEvents })
    }

    if (
      parsed.action === EVENTS_COMANDA_ACTION.PREPARE ||
      parsed.action === EVENTS_COMANDA_ACTION.WAREHOUSE_ONLY
    ) {
      const prepareEff = await getClientOverrideEffectForPermission(
        params.user.id,
        EVENTS_COMANDA_PREPARE_PERM
      )
      const legacyEff = await getClientOverrideEffectForPermission(
        params.user.id,
        EVENTS_WAREHOUSE_COMANDA_ONLY_PERM
      )
      if (prepareEff !== 'allow' && legacyEff !== 'allow') return false
      const canViewEvents = await canViewUiPath({ user: params.user, path: EVENTS_UI_PATH })
      return eventsWarehouseComandaActionBaseAccess({ canViewEvents })
    }

    if (parsed.action === EVENT_VISIT_VIDEO_ACTION) {
      const canViewEvents = await canViewUiPath({ user: params.user, path: EVENTS_UI_PATH })
      if (!canViewEvents) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        PERM.action(EVENTS_UI_PATH, EVENT_VISIT_VIDEO_ACTION)
      )
      if (eff === 'deny') return false
      if (eff !== 'allow') return false
      return baseCanAttachEventVisitVideo(params.user)
    }
  }

  if (parsed?.path === MAINTENANCE_TICKETS_UI_PATH) {
    if (parsed.action === MAINTENANCE_TICKETS_ACTION.INBOX) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_INBOX_PERM
      )
      if (eff === 'deny') return false
      if (eff === 'allow') return true
      return false
    }

    if (parsed.action === MAINTENANCE_TICKETS_ACTION.DELETE) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_DELETE_PERM
      )
      return eff === 'allow'
    }

    if (parsed.action === MAINTENANCE_TICKETS_ACTION.MANAGE) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_MANAGE_PERM
      )
      return eff === 'allow'
    }

    if (parsed.action === MAINTENANCE_TICKETS_ACTION.VALIDATE) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_VALIDATE_PERM
      )
      return eff === 'allow'
    }

    if (parsed.action === MAINTENANCE_TICKETS_ACTION.REOPEN) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_REOPEN_PERM
      )
      return eff === 'allow'
    }

    if (parsed.action === MAINTENANCE_TICKETS_ACTION.EXTERNALIZE) {
      const canViewTickets = await canViewUiPath({
        user: params.user,
        path: MAINTENANCE_TICKETS_UI_PATH,
      })
      if (!canViewTickets) return false
      const eff = await getClientOverrideEffectForPermission(
        params.user.id,
        MAINTENANCE_TICKETS_EXTERNALIZE_PERM
      )
      return eff === 'allow'
    }
  }

  return false
}

export async function canViewUiPath(params: { user: AccessUser & { id: string }; path: string }): Promise<boolean> {
  const path = String(params.path || '').trim()
  if (!path) return false

  const roleNorm = normalizeRole(params.user.role || undefined)
  if (roleNorm === 'admin') return true

  const assignment = await loadUserAccessAssignment(params.user.id)
  const map = buildUiViewMap(params.user, assignment)
  if (map[path] === true) return true

  const legacyConsulta =
    (path === SPACES_RESERVES_PATH &&
      (await getClientOverrideEffectForPermission(
        params.user.id,
        PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.RESERVES)
      )) === 'allow') ||
    (path === SPACES_BBDD_PATH &&
      (await getClientOverrideEffectForPermission(
        params.user.id,
        PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.BBDD)
      )) === 'allow')
  return legacyConsulta
}

export async function canEditUiPath(params: { user: AccessUser & { id: string }; path: string }): Promise<boolean> {
  const path = String(params.path || '').trim()
  if (!path) return false

  const roleNorm = normalizeRole(params.user.role || undefined)
  if (roleNorm === 'admin') return true

  const canView = await canViewUiPath({ user: params.user, path })
  if (!canView) return false

  const baseVisiblePaths = new Set<string>()
  for (const mod of getVisibleModules(params.user)) {
    baseVisiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) baseVisiblePaths.add(sub.path)
  }
  const base = baseVisiblePaths.has(path) && EDIT_ROLES.has(roleNorm)

  const eff = await getClientOverrideEffectForPermission(params.user.id, PERM.edit(path))
  if (eff === 'allow') return true
  if (eff === 'deny') return false

  const legacyParentEdit =
    path === SPACES_BBDD_PATH &&
    (await getClientOverrideEffectForPermission(params.user.id, PERM.edit(SPACES_UI_PATH)))
  if (legacyParentEdit === 'allow') return true
  if (legacyParentEdit === 'deny') return false

  return base
}

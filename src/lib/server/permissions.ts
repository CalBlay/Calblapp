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
import { baseCanValidateReservaComercials, RESERVA_COMERCIALS_UI_PATH } from '@/lib/reservaComercialsPermissions'
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

function isClientScopeOverride(o: AssignmentOverride | null | undefined) {
  return String(o?.scope || 'client') === 'client' && !String(o?.scopeId || '').trim()
}

export async function getClientOverrideEffectForPermission(
  userId: string,
  permission: string
): Promise<OverrideEffect | null> {
  const snap = await firestoreAdmin.collection('user_access_assignments').doc(String(userId)).get()
  if (!snap.exists) return null
  const data = snap.data() as UserAccessAssignment | undefined
  const list = Array.isArray(data?.overrides) ? data?.overrides : []
  const found = list.find((o) => isClientScopeOverride(o) && String(o?.permission || '').trim() === permission)
  if (!found) return null
  return found.effect === 'deny' ? 'deny' : 'allow'
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

  if (parsed?.path === QUADRANTS_UI_PATH && parsed.action === QUADRANTS_ACTION.PREMISSES_EDIT) {
    const canView = await canViewUiPath({ user: params.user, path: QUADRANTS_UI_PATH })
    if (!canView) return false
    const canEdit = await canEditUiPath({ user: params.user, path: QUADRANTS_UI_PATH })
    if (!canEdit) return false
    return baseCanEditQuadrantsPremisses(params.user)
  }

  return false
}

export async function canViewUiPath(params: { user: AccessUser & { id: string }; path: string }): Promise<boolean> {
  const path = String(params.path || '').trim()
  if (!path) return false

  const roleNorm = normalizeRole(params.user.role || undefined)
  if (roleNorm === 'admin') return true

  const baseVisiblePaths = new Set<string>()
  for (const mod of getVisibleModules(params.user)) {
    baseVisiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) baseVisiblePaths.add(sub.path)
  }
  const base = baseVisiblePaths.has(path)

  const eff = await getClientOverrideEffectForPermission(params.user.id, PERM.view(path))
  if (eff === 'allow') return true
  if (eff === 'deny') return false

  if (!base) {
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
    if (legacyConsulta) return true
  }

  return base
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


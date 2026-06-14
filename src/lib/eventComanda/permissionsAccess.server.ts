import type { AccessUser } from '@/lib/accessControl'
import {
  EVENTS_COMANDA_CREATE_PERM,
  EVENTS_COMANDA_PREPARE_PERM,
  EVENTS_WAREHOUSE_COMANDA_ONLY_PERM,
  eventsWarehouseComandaActionBaseAccess,
  EVENTS_UI_PATH,
  isEventsComandaPreparerOnlyView,
} from '@/lib/eventComandaPermissions'
import { normalizeRole } from '@/lib/roles'
import {
  canEditUiPath,
  getClientOverrideEffectForPermission,
  canViewUiPath,
} from '@/lib/server/permissions'

async function hasExplicitComandaCreatePerm(userId: string): Promise<boolean> {
  const effect = await getClientOverrideEffectForPermission(userId, EVENTS_COMANDA_CREATE_PERM)
  return effect === 'allow'
}

async function hasExplicitComandaPreparePerm(userId: string): Promise<boolean> {
  const prepareEffect = await getClientOverrideEffectForPermission(
    userId,
    EVENTS_COMANDA_PREPARE_PERM
  )
  if (prepareEffect === 'allow') return true

  const legacyEffect = await getClientOverrideEffectForPermission(
    userId,
    EVENTS_WAREHOUSE_COMANDA_ONLY_PERM
  )
  return legacyEffect === 'allow'
}

export async function hasEventComandaCreateAccess(
  user: AccessUser & { id: string }
): Promise<boolean> {
  const role = normalizeRole(user.role)
  if (role === 'admin' || role === 'direccio') return true
  if (await hasExplicitComandaCreatePerm(user.id)) return true
  return canEditUiPath({ user, path: EVENTS_UI_PATH })
}

export async function hasEventComandaPrepareAccess(
  user: AccessUser & { id: string }
): Promise<boolean> {
  const role = normalizeRole(user.role)
  if (role === 'admin' || role === 'direccio') return true

  const canViewEvents = await canViewUiPath({ user, path: EVENTS_UI_PATH })
  if (!eventsWarehouseComandaActionBaseAccess({ canViewEvents })) return false

  return hasExplicitComandaPreparePerm(user.id)
}

export async function hasEventsComandaPreparerOnlyAccess(
  user: AccessUser & { id: string }
): Promise<boolean> {
  const role = normalizeRole(user.role)
  const isAdminOrDireccio = role === 'admin' || role === 'direccio'
  const hasPrepare = await hasEventComandaPrepareAccess(user)
  if (!hasPrepare) return false

  const canEditEvents = await canEditUiPath({ user, path: EVENTS_UI_PATH })
  const hasExplicitCreate = await hasExplicitComandaCreatePerm(user.id)

  return isEventsComandaPreparerOnlyView({
    hasPrepareComandaAction: true,
    hasCreateComandaAction: hasExplicitCreate,
    isAdminOrDireccio,
    canEditEvents,
  })
}

/** @deprecated Usa hasEventsComandaPreparerOnlyAccess */
export async function hasEventsWarehouseComandaOnlyAccess(
  user: AccessUser & { id: string }
): Promise<boolean> {
  return hasEventsComandaPreparerOnlyAccess(user)
}

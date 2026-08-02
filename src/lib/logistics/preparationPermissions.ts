import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'
import {
  PREPARATION_WAREHOUSE_CODES,
  type PreparationWarehouseCode,
} from '@/lib/logistics/preparationWarehouses'

export const PREPARATION_UI_PATH = '/menu/logistica/preparacio'

export const PREPARATION_WAREHOUSE_ACTION_PREFIX = 'warehouse:'
export const PREPARATION_IMPORT_ACTION = 'services:import'
export const PREPARATION_IMPORT_PERM = PERM.action(
  PREPARATION_UI_PATH,
  PREPARATION_IMPORT_ACTION
)

export function preparationWarehousePerm(warehouse: PreparationWarehouseCode): string {
  return PERM.action(PREPARATION_UI_PATH, `${PREPARATION_WAREHOUSE_ACTION_PREFIX}${warehouse}`)
}

export const PREPARATION_WAREHOUSE_PERMISSION_KEYS = PREPARATION_WAREHOUSE_CODES.map(
  preparationWarehousePerm
)

export function isPreparationManagerRole(role: string): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'direccio' || normalized === 'cap'
}

export function listAllowedPreparationWarehouses(opts: {
  role: string
  actions?: Record<string, boolean>
}): PreparationWarehouseCode[] {
  if (isPreparationManagerRole(opts.role)) {
    return [...PREPARATION_WAREHOUSE_CODES]
  }

  return PREPARATION_WAREHOUSE_CODES.filter(
    (warehouse) => opts.actions?.[preparationWarehousePerm(warehouse)] === true
  )
}

export function canMarkPreparationWarehouse(opts: {
  role: string
  warehouse: PreparationWarehouseCode
  actions?: Record<string, boolean>
}): boolean {
  return listAllowedPreparationWarehouses(opts).includes(opts.warehouse)
}

/**
 * UI `/api/permissions/ui` action map for Excel import.
 * Mirrors server `isUiPermissionGranted` defaults: managers may import unless
 * an explicit deny override is present.
 */
export function resolvePreparationImportUiAction(opts: {
  canViewPreparation: boolean
  role: string
  overrideEffect?: 'allow' | 'deny' | null
}): boolean {
  if (!opts.canViewPreparation) return false
  if (opts.overrideEffect === 'deny') return false
  if (opts.overrideEffect === 'allow') return true
  return isPreparationManagerRole(opts.role)
}

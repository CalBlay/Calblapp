import { PERM } from '@/lib/permissionKeys'
import { normalizeRole } from '@/lib/roles'
import {
  PREPARATION_WAREHOUSE_CODES,
  type PreparationWarehouseCode,
} from '@/lib/logistics/preparationWarehouses'

export const PREPARATION_UI_PATH = '/menu/logistica/preparacio'

export const PREPARATION_WAREHOUSE_ACTION_PREFIX = 'warehouse:'

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

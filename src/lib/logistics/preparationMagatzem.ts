import { PREPARATION_WAREHOUSE_CODES } from '@/lib/logistics/preparationWarehouses'
import type { PreparationWarehouseCompletion, PreparationWarehouseCompletionMap } from '@/lib/logistics/prepTypes'

export function emptyPreparationWarehouseMap(): PreparationWarehouseCompletionMap {
  return {}
}

export function normalizePreparationWarehouseMap(
  raw: unknown
): PreparationWarehouseCompletionMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyPreparationWarehouseMap()
  }

  const map: PreparationWarehouseCompletionMap = {}
  for (const warehouse of PREPARATION_WAREHOUSE_CODES) {
    const entry = (raw as Record<string, unknown>)[warehouse]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const userId = String((entry as PreparationWarehouseCompletion).userId || '').trim()
    const userName = String((entry as PreparationWarehouseCompletion).userName || '').trim()
    const at = String((entry as PreparationWarehouseCompletion).at || '').trim()
    if (!at) continue
    const status =
      (entry as PreparationWarehouseCompletion).status === 'not_applicable'
        ? 'not_applicable'
        : 'completed'
    const reason = String((entry as PreparationWarehouseCompletion).reason || '').trim()
    map[warehouse] = {
      userId,
      userName,
      at,
      status,
      ...(status === 'not_applicable' && reason ? { reason } : {}),
    }
  }
  return map
}

export function isPreparationWarehouseNotApplicable(
  entry?: PreparationWarehouseCompletion
): boolean {
  return entry?.status === 'not_applicable'
}

export function countCompletedWarehouses(map: PreparationWarehouseCompletionMap): number {
  return PREPARATION_WAREHOUSE_CODES.filter((warehouse) => Boolean(map[warehouse]?.at)).length
}

export function preparationLinePct(map: PreparationWarehouseCompletionMap): number {
  return Math.round((countCompletedWarehouses(map) / PREPARATION_WAREHOUSE_CODES.length) * 100)
}

export function isPreparationLineComplete(map: PreparationWarehouseCompletionMap): boolean {
  return countCompletedWarehouses(map) >= PREPARATION_WAREHOUSE_CODES.length
}

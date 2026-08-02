import { listEventComandaWarehouseRules } from '@/lib/eventComanda/warehouseRules.server'
import {
  listEventComandaWarehouses,
  type EventComandaWarehouse,
} from '@/lib/eventComanda/warehouses.server'
import type { EventComandaWarehouseRule } from '@/lib/eventComanda/warehouseRules.server'

const TTL_MS = 5 * 60 * 1000

type CacheEntry<T> = { data: T; expiresAt: number }

let rulesCache: CacheEntry<EventComandaWarehouseRule[]> | null = null
let warehousesCache: CacheEntry<EventComandaWarehouse[]> | null = null

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return Boolean(entry && Date.now() < entry.expiresAt)
}

export async function getCachedEventComandaWarehouseRules() {
  if (isFresh(rulesCache)) return rulesCache.data
  const data = await listEventComandaWarehouseRules()
  rulesCache = { data, expiresAt: Date.now() + TTL_MS }
  return data
}

export async function getCachedEventComandaWarehouses(activeOnly = true) {
  if (isFresh(warehousesCache)) return warehousesCache.data
  const data = await listEventComandaWarehouses(activeOnly)
  warehousesCache = { data, expiresAt: Date.now() + TTL_MS }
  return data
}

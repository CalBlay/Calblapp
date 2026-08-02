import {
  corporateFilterBadgeBaseClass,
  corporateFilterBadgeClass,
  corporateFilterBadgeInactiveClass,
} from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

/** Paleta estable per magatzems sense color assignat (alineada amb `colors.ts`). */
const WAREHOUSE_BADGE_PALETTE = [
  'border-sky-200 bg-sky-50 text-sky-900',
  'border-orange-200 bg-orange-50 text-orange-900',
  'border-violet-200 bg-violet-50 text-violet-900',
  'border-amber-200 bg-amber-50 text-amber-900',
  'border-pink-200 bg-pink-50 text-pink-900',
  'border-emerald-200 bg-emerald-50 text-emerald-900',
  'border-rose-200 bg-rose-50 text-rose-900',
  'border-cyan-200 bg-cyan-50 text-cyan-900',
  'border-indigo-200 bg-indigo-50 text-indigo-900',
  'border-teal-200 bg-teal-50 text-teal-900',
  'border-lime-200 bg-lime-50 text-lime-900',
  'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900',
] as const

/** Magatzems habituals de comanda d'esdeveniments. */
const WAREHOUSE_BADGE_COLORS: Record<string, string> = {
  begudes: 'border-sky-200 bg-sky-50 text-sky-900',
  decoracions: 'border-rose-200 bg-rose-50 text-rose-900',
  maquinaria: 'border-amber-200 bg-amber-50 text-amber-900',
  material: 'border-slate-300 bg-slate-100 text-slate-800',
  mobiliari: 'border-violet-200 bg-violet-50 text-violet-900',
  parament: 'border-teal-200 bg-teal-50 text-teal-900',
  'plats esdeveniments': 'border-orange-200 bg-orange-50 text-orange-900',
  cuina: 'border-red-200 bg-red-50 text-red-900',
}

function normalizeWarehouseKey(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function warehouseColorIndex(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  }
  return hash % WAREHOUSE_BADGE_PALETTE.length
}

export function eventComandaWarehouseLabel(
  warehouseName?: string | null,
  warehouseCode?: string | null
) {
  return String(warehouseName || '').trim() || String(warehouseCode || '').trim()
}

export function eventComandaWarehouseBadgeColor(
  warehouseName?: string | null,
  warehouseCode?: string | null
) {
  const label = eventComandaWarehouseLabel(warehouseName, warehouseCode)
  const key = normalizeWarehouseKey(label)
  if (!key) return WAREHOUSE_BADGE_PALETTE[0]
  return WAREHOUSE_BADGE_COLORS[key] || WAREHOUSE_BADGE_PALETTE[warehouseColorIndex(key)]
}

export function eventComandaWarehouseFilterBadgeClass(
  warehouseName?: string | null,
  warehouseCode?: string | null,
  active = false
) {
  if (!active) {
    return cn(corporateFilterBadgeBaseClass, corporateFilterBadgeInactiveClass)
  }
  return cn(corporateFilterBadgeBaseClass, eventComandaWarehouseBadgeColor(warehouseName, warehouseCode))
}

export function eventComandaWarehouseFilterAllBadgeClass(active: boolean) {
  return corporateFilterBadgeClass(active)
}

import type { TabId } from './robaPersonalTypes'

export const ROBA_TAB_IDS = new Set<TabId>([
  'productes',
  'treballadors',
  'estoc',
  'sollicituds',
  'entregues',
  'compres',
])

export function parseRobaTab(v: string | null): TabId | null {
  if (!v) return null
  const t = v.trim() as TabId
  return ROBA_TAB_IDS.has(t) ? t : null
}

export const ROBA_REQUEST_STATUS_LABEL: Record<string, string> = {
  submitted: 'Enviada',
  prepared: 'Preparada',
  picked_up: 'Recollida (cap)',
  fulfilled: 'Lliurada',
  receipt_confirmed: 'Confirmada',
  cancelled: 'Cancel·lada',
  draft: 'Esborrany',
  approved: 'Aprovada',
  rejected: 'Rebutjada',
}

export const SOLIC_TABLE_COLS = 9

export const ENTREGUES_TABLE_COLS_LEAD = 9
export const ENTREGUES_TABLE_COLS_WORKER = 8

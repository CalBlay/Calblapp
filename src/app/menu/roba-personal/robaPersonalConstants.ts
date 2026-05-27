import type { TabId } from './robaPersonalTypes'

export const ROBA_TAB_IDS = new Set<TabId>([
  'productes',
  'treballadors',
  'estoc',
  'informes',
  'sollicituds',
  'preparacio',
  'recollides',
  'entregues',
  'compres',
])

export function parseRobaTab(v: string | null): TabId | null {
  if (!v) return null
  const t = v.trim() as TabId
  return ROBA_TAB_IDS.has(t) ? t : null
}

export const ROBA_REQUEST_STATUS_LABEL: Record<string, string> = {
  submitted: 'Sol·licitada',
  sent_to_rrhh: 'Enviada a RRHH',
  prepared: 'Preparada',
  ready_for_worker_delivery: 'Preparada per recollir',
  picked_up: 'Recollida pendent entrega',
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

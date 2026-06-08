import type { AccessUser } from '@/lib/accessControl'
import type { TabId } from '@/app/menu/roba-personal/robaPersonalTypes'
import { normalizeRole, type Role } from '@/lib/roles'

export const ROBA_PERSONAL_UI_PATH = '/menu/roba-personal'

export const ROBA_SUBMODULE_PATHS = {
  productes: '/menu/roba-personal/productes',
  treballadors: '/menu/roba-personal/treballadors',
  estoc: '/menu/roba-personal/estoc',
  informes: '/menu/roba-personal/informes',
  sollicituds: '/menu/roba-personal/sollicituds',
  preparacio: '/menu/roba-personal/preparacio',
  recollides: '/menu/roba-personal/recollides',
  entregues: '/menu/roba-personal/entregues',
  compres: '/menu/roba-personal/compres',
} as const

export type RobaSubmodulePath =
  (typeof ROBA_SUBMODULE_PATHS)[keyof typeof ROBA_SUBMODULE_PATHS]

const RRHH_DEPT = 'recursos humans'

/** Rols base per submòduls (filtre addicional per perfil a `robaVisibleSubmodulePaths`). */
export const ROBA_SUBMODULE_ROLES: Role[] = ['admin', 'direccio', 'cap', 'treballador']

export const ROBA_PERSONAL_SUBMODULE_DEFS: ReadonlyArray<{
  label: string
  path: RobaSubmodulePath
  tabId: TabId
}> = [
  { label: 'Productes', path: ROBA_SUBMODULE_PATHS.productes, tabId: 'productes' },
  { label: 'Treballadors', path: ROBA_SUBMODULE_PATHS.treballadors, tabId: 'treballadors' },
  { label: 'Estoc', path: ROBA_SUBMODULE_PATHS.estoc, tabId: 'estoc' },
  { label: 'Informes', path: ROBA_SUBMODULE_PATHS.informes, tabId: 'informes' },
  { label: 'Sol·licituds', path: ROBA_SUBMODULE_PATHS.sollicituds, tabId: 'sollicituds' },
  { label: 'Preparació', path: ROBA_SUBMODULE_PATHS.preparacio, tabId: 'preparacio' },
  { label: 'Recepcions', path: ROBA_SUBMODULE_PATHS.recollides, tabId: 'recollides' },
  { label: 'Entregues', path: ROBA_SUBMODULE_PATHS.entregues, tabId: 'entregues' },
  { label: 'Compres', path: ROBA_SUBMODULE_PATHS.compres, tabId: 'compres' },
]

const ROBA_FULL_TAB_IDS: TabId[] = [
  'productes',
  'treballadors',
  'estoc',
  'informes',
  'sollicituds',
  'preparacio',
  'recollides',
  'entregues',
  'compres',
]

const ROBA_DEPT_LEAD_TAB_IDS: TabId[] = ['sollicituds', 'recollides', 'entregues']
const ROBA_WORKER_TAB_IDS: TabId[] = ['sollicituds', 'entregues']

function normDept(d?: string | null): string {
  return String(d || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function robaTabUiPath(tabId: TabId): string {
  return ROBA_SUBMODULE_PATHS[tabId]
}

/** Administrador, direcció o departament Recursos Humans (mateix criteri que el dashboard). */
export function isRobaFullAccessUser(user: AccessUser): boolean {
  const role = normalizeRole(user.role)
  if (role === 'admin' || role === 'direccio') return true
  return normDept(user.department) === RRHH_DEPT
}

/**
 * Accés operatiu real a les APIs `/api/roba-personal/*` (alineat amb `resolveRobaAccess` al servidor).
 * Direcció sense RRHH / cap de roba / personnel vinculat no té accés encara que vegi el mòdul a la UI.
 */
export function hasRobaOperationalApiAccess(user: AccessUser): boolean {
  const role = normalizeRole(user.role)
  if (role === 'admin') return true
  if (normDept(user.department) === RRHH_DEPT) return true
  if (user.isDepartmentRobaLead) return true
  if (String(user.robaLinkedPersonnelId || '').trim()) return true
  return false
}

/** RRHH / admin per comptadors de preparació (`sent_to_rrhh`). */
export function isRobaRrhhOperationalUser(user: AccessUser): boolean {
  const role = normalizeRole(user.role)
  if (role === 'admin') return true
  return normDept(user.department) === RRHH_DEPT
}

/** Paths de pestanya visibles per defecte (abans d’overrides de matriu). */
export function robaVisibleSubmodulePaths(user: AccessUser): Set<string> {
  const robaLinked = Boolean(String(user.robaLinkedPersonnelId || '').trim())
  const full = isRobaFullAccessUser(user)
  const deptLead = Boolean(user.isDepartmentRobaLead) && !full
  const worker = robaLinked && !full && !deptLead

  const paths = new Set<string>()
  if (full) {
    for (const id of ROBA_FULL_TAB_IDS) paths.add(robaTabUiPath(id))
    return paths
  }
  if (deptLead) {
    for (const id of ROBA_DEPT_LEAD_TAB_IDS) paths.add(robaTabUiPath(id))
    return paths
  }
  if (worker) {
    for (const id of ROBA_WORKER_TAB_IDS) paths.add(robaTabUiPath(id))
    return paths
  }
  return paths
}

/** Flux operatiu (sol·licituds → entregues) per APIs compartides. */
export const ROBA_WORKFLOW_UI_PATHS: RobaSubmodulePath[] = [
  ROBA_SUBMODULE_PATHS.sollicituds,
  ROBA_SUBMODULE_PATHS.preparacio,
  ROBA_SUBMODULE_PATHS.recollides,
  ROBA_SUBMODULE_PATHS.entregues,
]

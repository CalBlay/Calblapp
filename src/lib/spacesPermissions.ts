import { canEditFinca, isProductionWorker, type AccessUser } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'

export const SPACES_UI_PATH = '/menu/spaces'
export const SPACES_RESERVES_PATH = '/menu/spaces/reserves'
export const SPACES_BBDD_PATH = '/menu/spaces/info'
export const SPACES_PREMISSES_PATH = '/menu/spaces/premisses'

/** Accions fines dins de Consulta BBDD (matriu d’accions opcional). */
export const SPACES_ACTION = {
  BBDD_EXPORT: 'bbdd:export',
  BBDD_CREATE: 'bbdd:create',
  BBDD_UPDATE: 'bbdd:update',
  BBDD_DELETE: 'bbdd:delete',
  PREMISSES_EDIT: 'premisses:edit',
} as const

/** Permisos d’acció antics (consultes com a checkbox); es resolen via submòduls view. */
export const SPACES_LEGACY_CONSULTA_ACTION = {
  RESERVES: 'consulta:reserves',
  BBDD: 'consulta:bbdd',
} as const

/** Path on es desen les accions BBDD (nou). Les claus antigues usaven SPACES_UI_PATH. */
export const SPACES_BBDD_ACTION_PATH = SPACES_BBDD_PATH

/** Edició al submòdul BBDD implica crear i editar (llevat de deny explícit a l’acció). */
export const SPACES_EDIT_IMPLIED_ACTIONS = new Set<string>([
  SPACES_ACTION.BBDD_CREATE,
  SPACES_ACTION.BBDD_UPDATE,
])

export function baseCanDeleteSpacesBbdd(user?: AccessUser): boolean {
  if (!user) return false
  const role = normalizeRole(user.role)
  const dept = String(user.department || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  return (
    role === 'admin' ||
    (role === 'cap' && dept === 'produccio' && !isProductionWorker(user))
  )
}

export function baseCanEditSpacesPremisses(user?: AccessUser): boolean {
  return normalizeRole(user?.role) === 'admin'
}

export function baseCanMutateSpacesBbdd(user?: AccessUser): boolean {
  return canEditFinca(user)
}

export function isSpacesBbddActionPath(path: string): boolean {
  return path === SPACES_BBDD_PATH || path === SPACES_UI_PATH
}

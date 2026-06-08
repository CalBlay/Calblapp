import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { getVisibleModules, MODULES, type AccessUser } from '@/lib/accessControl'
import { baseCanValidateReservaComercials, RESERVA_COMERCIALS_UI_PATH } from '@/lib/reservaComercialsPermissions'
import {
  QUADRANTS_ACTION,
  QUADRANTS_UI_PATH,
  baseCanEditQuadrantsPremisses,
} from '@/lib/quadrantsPermissions'
import {
  SPACES_ACTION,
  SPACES_BBDD_ACTION_PATH,
  SPACES_BBDD_PATH,
  SPACES_EDIT_IMPLIED_ACTIONS,
  SPACES_LEGACY_CONSULTA_ACTION,
  SPACES_PREMISSES_PATH,
  SPACES_RESERVES_PATH,
  SPACES_UI_PATH,
  baseCanDeleteSpacesBbdd,
  baseCanEditSpacesPremisses,
  baseCanMutateSpacesBbdd,
} from '@/lib/spacesPermissions'
import { normalizeRole } from '@/lib/roles'
import { buildUiViewMap } from '@/lib/permissions/buildUiViewMap'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import {
  INCIDENTS_ACTION,
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_MEETING_MINUTES_PERM,
  INCIDENTS_QUADRE_PATH,
  INCIDENTS_UI_PATH,
  incidentsActionBaseAccess,
} from '@/lib/incidentsPermissions'
import {
  CALENDAR_EDIT_IMPLIED_ACTIONS,
  PERM,
  actionPermKey,
  editPathFromPerm,
  isActionPerm,
  isEditPerm,
  isViewPerm,
} from '@/lib/permissionKeys'

type UiPermissionMap = Record<string, boolean>
type UiEditMap = Record<string, boolean>
type UiActionMap = Record<string, boolean>

type UserAccessAssignment = {
  overrides?: Array<{
    permission?: string
    effect?: 'allow' | 'deny'
    scope?: 'client' | 'centre' | 'project'
    scopeId?: string | null
  }>
}

// Catàleg mínim d'accions especials (MVP). Anirem ampliant per mòduls.
const ACTION_CATALOG: Array<{ path: string; action: string }> = [
  { path: '/menu/allergens/bbdd', action: 'import' },
  { path: '/menu/allergens/bbdd', action: 'replace' },
  { path: '/menu/allergens/bbdd', action: 'export' },
  { path: '/menu/media', action: 'source:incidents' },
  { path: '/menu/media', action: 'source:maintenance' },
  { path: '/menu/media', action: 'source:messaging' },
  { path: '/menu/media', action: 'source:audits' },
  { path: '/menu/media', action: 'source:spaces' },
  { path: '/menu/media', action: 'delete' },
  { path: '/menu/calendar', action: 'manual:create' },
  { path: '/menu/calendar', action: 'manual:update' },
  { path: '/menu/calendar', action: 'manual:delete' },
  { path: '/menu/calendar', action: 'attach:sharepoint' },
  { path: '/menu/calendar', action: 'sync:zoho' },
  { path: '/menu/calendar', action: 'sync:ada' },
  { path: '/menu/events', action: 'docs:view' },
  { path: '/menu/events', action: 'docs:attach:kitchen' },
  { path: '/menu/events', action: 'modifications:register' },
  { path: '/menu/events', action: 'event:close' },
  { path: INCIDENTS_UI_PATH, action: 'command-board' },
  { path: INCIDENTS_UI_PATH, action: 'meeting-minutes' },
  { path: '/menu/quadrants', action: 'save' },
  { path: '/menu/quadrants', action: 'confirm' },
  { path: '/menu/quadrants', action: 'draft:save' },
  { path: '/menu/quadrants', action: 'draft:confirm' },
  { path: '/menu/quadrants', action: 'draft:delete' },
  { path: '/menu/quadrants', action: 'draft:unconfirm' },
  { path: QUADRANTS_UI_PATH, action: QUADRANTS_ACTION.PREMISSES_EDIT },
  { path: RESERVA_COMERCIALS_UI_PATH, action: 'request' },
  { path: RESERVA_COMERCIALS_UI_PATH, action: 'validate' },
  { path: SPACES_BBDD_ACTION_PATH, action: SPACES_ACTION.BBDD_EXPORT },
  { path: SPACES_BBDD_ACTION_PATH, action: SPACES_ACTION.BBDD_CREATE },
  { path: SPACES_BBDD_ACTION_PATH, action: SPACES_ACTION.BBDD_UPDATE },
  { path: SPACES_BBDD_ACTION_PATH, action: SPACES_ACTION.BBDD_DELETE },
  // Legacy (consultes com a acció; es mapen als submòduls view)
  { path: SPACES_UI_PATH, action: SPACES_LEGACY_CONSULTA_ACTION.RESERVES },
  { path: SPACES_UI_PATH, action: SPACES_LEGACY_CONSULTA_ACTION.BBDD },
  { path: SPACES_UI_PATH, action: SPACES_ACTION.BBDD_EXPORT },
  { path: SPACES_UI_PATH, action: SPACES_ACTION.BBDD_CREATE },
  { path: SPACES_UI_PATH, action: SPACES_ACTION.BBDD_UPDATE },
  { path: SPACES_UI_PATH, action: SPACES_ACTION.BBDD_DELETE },
  { path: SPACES_UI_PATH, action: SPACES_ACTION.PREMISSES_EDIT },
  { path: SPACES_RESERVES_PATH, action: SPACES_ACTION.RESERVES_MANUAL_CREATE },
]

function spacesActionEffect(
  assignment: UserAccessAssignment | null,
  action: string,
  path: string = SPACES_BBDD_ACTION_PATH
): 'allow' | 'deny' | null {
  const primary = effectFor(assignment, PERM.action(path, action))
  if (primary) return primary
  if (path === SPACES_BBDD_ACTION_PATH) {
    return effectFor(assignment, PERM.action(SPACES_UI_PATH, action))
  }
  return null
}

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])

function effectFor(assignment: UserAccessAssignment | null, permission: string): 'allow' | 'deny' | null {
  const list = assignment?.overrides
  if (!Array.isArray(list) || list.length === 0) return null
  const found = list.find(
    (o) =>
      String(o?.permission || '').trim() === permission &&
      String(o?.scope || 'client') === 'client' &&
      !String(o?.scopeId || '').trim()
  )
  if (!found) return null
  return found.effect === 'deny' ? 'deny' : 'allow'
}

export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  // Construïm l'usuari base des de la sessió
  const u = auth.user
  const accessUser: AccessUser = {
    role: u?.role ?? undefined,
    department: u?.department ?? undefined,
    canRespondSurveys: Boolean(u?.canRespondSurveys),
    isDepartmentRobaLead: Boolean(u?.isDepartmentRobaLead),
    robaLinkedPersonnelId: u?.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable: typeof u?.opsProjectsConfigurable === 'boolean' ? u.opsProjectsConfigurable : undefined,
    isTransportLead: Boolean(u?.isTransportLead),
  }

  const visibleModules = getVisibleModules(accessUser)
  const baseVisiblePaths = new Set<string>()
  for (const mod of visibleModules) {
    baseVisiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) baseVisiblePaths.add(sub.path)
  }

  // Overrides guardats per usuari (client-scope)
  const aSnap = await firestoreAdmin.collection('user_access_assignments').doc(auth.user.id).get()
  const assignment: UserAccessAssignmentDoc = aSnap.exists
    ? (aSnap.data() as UserAccessAssignmentDoc)
    : null

  const map: UiPermissionMap = buildUiViewMap(accessUser, assignment)
  const edit: UiEditMap = {}
  const actions: UiActionMap = {}

  // Default: edició per rol (només si el path és visible per base)
  const roleNorm = normalizeRole(accessUser.role)
  const baseCanEdit = EDIT_ROLES.has(roleNorm)
  for (const mod of MODULES) {
    edit[mod.path] = baseVisiblePaths.has(mod.path) ? baseCanEdit : false
    for (const sub of mod.submodules || []) {
      edit[sub.path] = baseVisiblePaths.has(sub.path) ? baseCanEdit : false
    }
  }

  // Default: accions especials desactivades
  for (const a of ACTION_CATALOG) {
    actions[PERM.action(a.path, a.action)] = false
  }

  // Aplicar overrides (allow/deny) també per paths que NO eren visibles al base
  const list = assignment?.overrides
  if (Array.isArray(list)) {
    for (const o of list) {
      if (String(o?.scope || 'client') !== 'client') continue
      if (String(o?.scopeId || '').trim()) continue

      // View overrides (ja aplicats a `map` via buildUiViewMap)
      if (isViewPerm(o?.permission)) {
        continue
      }

      // Action overrides
      if (isActionPerm(o?.permission)) {
        const key = actionPermKey(o?.permission)
        if (!key) continue
        actions[key] = o.effect === 'deny' ? false : true
        continue
      }

      // Edit overrides
      if (isEditPerm(o?.permission)) {
        const path = editPathFromPerm(String(o?.permission || ''))
        if (!path) continue
        edit[path] = o.effect === 'deny' ? false : true
        continue
      }
    }
  }

  // Edició al calendari implica crear/editar manuals i adjuntar (llevat de deny explícit)
  if (edit['/menu/calendar'] === true) {
    for (const action of CALENDAR_EDIT_IMPLIED_ACTIONS) {
      const key = PERM.action('/menu/calendar', action)
      const actionEff = effectFor(assignment, key)
      if (actionEff !== 'deny') actions[key] = true
    }
  }

  // Legacy: consulta com a acció → visibilitat de submòdul
  const legacyReservesEff = effectFor(
    assignment,
    PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.RESERVES)
  )
  if (legacyReservesEff === 'deny') map[SPACES_RESERVES_PATH] = false
  if (legacyReservesEff === 'allow') map[SPACES_RESERVES_PATH] = true

  const legacyBbddEff = effectFor(
    assignment,
    PERM.action(SPACES_UI_PATH, SPACES_LEGACY_CONSULTA_ACTION.BBDD)
  )
  if (legacyBbddEff === 'deny') map[SPACES_BBDD_PATH] = false
  if (legacyBbddEff === 'allow') map[SPACES_BBDD_PATH] = true

  // Espais · BBDD: accions fines (export / CRUD) quan el submòdul és visible
  if (map[SPACES_BBDD_PATH] === true) {
    const exportKey = PERM.action(SPACES_BBDD_ACTION_PATH, SPACES_ACTION.BBDD_EXPORT)
    const createKey = PERM.action(SPACES_BBDD_ACTION_PATH, SPACES_ACTION.BBDD_CREATE)
    const updateKey = PERM.action(SPACES_BBDD_ACTION_PATH, SPACES_ACTION.BBDD_UPDATE)
    const deleteKey = PERM.action(SPACES_BBDD_ACTION_PATH, SPACES_ACTION.BBDD_DELETE)

    if (spacesActionEffect(assignment, SPACES_ACTION.BBDD_EXPORT) !== 'deny') {
      actions[exportKey] = true
      actions[PERM.action(SPACES_UI_PATH, SPACES_ACTION.BBDD_EXPORT)] = true
    }
    if (
      baseCanMutateSpacesBbdd(accessUser) &&
      spacesActionEffect(assignment, SPACES_ACTION.BBDD_CREATE) !== 'deny'
    ) {
      actions[createKey] = true
      actions[PERM.action(SPACES_UI_PATH, SPACES_ACTION.BBDD_CREATE)] = true
    }
    if (
      baseCanMutateSpacesBbdd(accessUser) &&
      spacesActionEffect(assignment, SPACES_ACTION.BBDD_UPDATE) !== 'deny'
    ) {
      actions[updateKey] = true
      actions[PERM.action(SPACES_UI_PATH, SPACES_ACTION.BBDD_UPDATE)] = true
    }
    if (
      baseCanDeleteSpacesBbdd(accessUser) &&
      spacesActionEffect(assignment, SPACES_ACTION.BBDD_DELETE) !== 'deny'
    ) {
      actions[deleteKey] = true
      actions[PERM.action(SPACES_UI_PATH, SPACES_ACTION.BBDD_DELETE)] = true
    }
  }

  const bbddCanEdit = edit[SPACES_BBDD_PATH] === true || edit[SPACES_UI_PATH] === true
  if (bbddCanEdit && map[SPACES_BBDD_PATH] === true) {
    for (const action of SPACES_EDIT_IMPLIED_ACTIONS) {
      if (spacesActionEffect(assignment, action) === 'deny') continue
      actions[PERM.action(SPACES_BBDD_ACTION_PATH, action)] = true
      actions[PERM.action(SPACES_UI_PATH, action)] = true
    }
  }

  if (
    map[SPACES_PREMISSES_PATH] === true &&
    edit[SPACES_PREMISSES_PATH] === true &&
    baseCanEditSpacesPremisses(accessUser) &&
    spacesActionEffect(assignment, SPACES_ACTION.PREMISSES_EDIT) !== 'deny'
  ) {
    actions[PERM.action(SPACES_UI_PATH, SPACES_ACTION.PREMISSES_EDIT)] = true
  }

  if (
    map[SPACES_RESERVES_PATH] === true &&
    edit[SPACES_RESERVES_PATH] === true &&
    spacesActionEffect(
      assignment,
      SPACES_ACTION.RESERVES_MANUAL_CREATE,
      SPACES_RESERVES_PATH
    ) !== 'deny'
  ) {
    actions[PERM.action(SPACES_RESERVES_PATH, SPACES_ACTION.RESERVES_MANUAL_CREATE)] =
      true
  }

  if (
    map[QUADRANTS_UI_PATH] === true &&
    edit[QUADRANTS_UI_PATH] === true &&
    baseCanEditQuadrantsPremisses(accessUser) &&
    effectFor(assignment, PERM.action(QUADRANTS_UI_PATH, QUADRANTS_ACTION.PREMISSES_EDIT)) !== 'deny'
  ) {
    actions[PERM.action(QUADRANTS_UI_PATH, QUADRANTS_ACTION.PREMISSES_EDIT)] = true
  }

  // Incidències: quadre i acta només amb allow explícit (Settings → permisos)
  const incidentsActionBase = {
    canViewIncidents: map[INCIDENTS_UI_PATH] === true,
    canEditIncidents: edit[INCIDENTS_UI_PATH] === true,
    canViewQuadrePath: map[INCIDENTS_QUADRE_PATH] === true,
  }

  if (
    effectFor(assignment, INCIDENTS_MEETING_MINUTES_PERM) === 'allow' &&
    incidentsActionBaseAccess(accessUser, incidentsActionBase, INCIDENTS_ACTION.MEETING_MINUTES)
  ) {
    actions[INCIDENTS_MEETING_MINUTES_PERM] = true
  }

  if (
    effectFor(assignment, INCIDENTS_COMMAND_BOARD_PERM) === 'allow' &&
    incidentsActionBaseAccess(accessUser, incidentsActionBase, INCIDENTS_ACTION.COMMAND_BOARD)
  ) {
    actions[INCIDENTS_COMMAND_BOARD_PERM] = true
  }

  // Menú / URL del submòdul alineats amb l’acció (override del view base del catàleg)
  if (map[INCIDENTS_UI_PATH] === true || map[INCIDENTS_QUADRE_PATH] === true) {
    if (actions[INCIDENTS_COMMAND_BOARD_PERM] === true) {
      map[INCIDENTS_QUADRE_PATH] = true
    } else if (actions[INCIDENTS_COMMAND_BOARD_PERM] === false) {
      map[INCIDENTS_QUADRE_PATH] = false
    }
  }

  // Reserva comercials: veure el submòdul implica sol·licitud; validació només admin / cap transports
  if (map[RESERVA_COMERCIALS_UI_PATH] === true) {
    const requestKey = PERM.action(RESERVA_COMERCIALS_UI_PATH, 'request')
    const validateKey = PERM.action(RESERVA_COMERCIALS_UI_PATH, 'validate')
    if (effectFor(assignment, requestKey) !== 'deny') actions[requestKey] = true
    if (
      baseCanValidateReservaComercials({
        role: accessUser.role,
        isTransportLead: accessUser.isTransportLead,
      }) &&
      effectFor(assignment, validateKey) !== 'deny'
    ) {
      actions[validateKey] = true
    }
  }

  // si és admin, sempre true a tot el catàleg
  const r = normalizeRole(accessUser.role)
  if (r === 'admin') {
    for (const k of Object.keys(map)) map[k] = true
    for (const k of Object.keys(edit)) edit[k] = true
    for (const k of Object.keys(actions)) actions[k] = true
  }

  return NextResponse.json({ map, edit, actions })
}

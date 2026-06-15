import { MODULES, getVisibleModules, type AccessUser } from '@/lib/accessControl'
import { finalizeModuleVisibilityMap } from '@/lib/moduleMenuNavigation'
import { getClientOverrideEffect } from '@/lib/permissions/overrideState'
import type { UserAccessAssignmentDoc } from '@/lib/permissions/types'
import { PERM } from '@/lib/permissionKeys'

/**
 * Mòduls que abans s'obrien per vincle `personnel` / regles legacy.
 * Amb `user_access_assignments`, només són visibles amb `allow` explícit a Settings.
 */
const EXPLICIT_ALLOW_ONLY_MODULE_PATHS = ['/menu/roba-personal'] as const

function viewOverrideEffect(
  assignment: UserAccessAssignmentDoc,
  path: string
): 'allow' | 'deny' | null {
  const overrides = assignment?.overrides ?? []
  return getClientOverrideEffect(overrides, PERM.view(path))
}

/**
 * Mapa de visualització UI (Settings → permisos per usuari).
 * Base = rol/departament; overrides allow/deny tenen prioritat.
 * Un deny explícit al mòdul pare amaga tot el subtree.
 */
export function buildUiViewMap(
  accessUser: AccessUser,
  assignment: UserAccessAssignmentDoc
): Record<string, boolean> {
  const visibleModules = getVisibleModules(accessUser)
  const baseVisiblePaths = new Set<string>()
  for (const mod of visibleModules) {
    baseVisiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) {
      baseVisiblePaths.add(sub.path)
    }
  }

  const map: Record<string, boolean> = {}

  for (const mod of MODULES) {
    const paths = [mod.path, ...(mod.submodules || []).map((s) => s.path)]
    for (const path of paths) {
      const base = baseVisiblePaths.has(path)
      const override = viewOverrideEffect(assignment, path)
      let visible = base
      if (override === 'allow') visible = true
      if (override === 'deny') visible = false
      map[path] = visible
    }
  }

  // Denegació explícita del pare → cap submòdul visible
  for (const mod of MODULES) {
    if (viewOverrideEffect(assignment, mod.path) !== 'deny') continue
    map[mod.path] = false
    for (const sub of mod.submodules || []) {
      map[sub.path] = false
    }
  }

  // Allow explícit al pare → hereta visualització als fills (llevat de deny explícit al fill)
  for (const mod of MODULES) {
    if (viewOverrideEffect(assignment, mod.path) !== 'allow') continue
    map[mod.path] = true
    for (const sub of mod.submodules || []) {
      if (viewOverrideEffect(assignment, sub.path) === 'deny') continue
      map[sub.path] = true
    }
  }

  // Promoure pare si algun fill és visible (mai si el pare està denegat explícitament)
  for (const mod of MODULES) {
    if (viewOverrideEffect(assignment, mod.path) === 'deny') continue
    for (const sub of mod.submodules || []) {
      if (map[sub.path] === true) {
        map[mod.path] = true
        break
      }
    }
  }

  finalizeModuleVisibilityMap(map, MODULES, {
    isParentExplicitlyAllowed: (path) => viewOverrideEffect(assignment, path) === 'allow',
    isParentExplicitlyDenied: (path) => viewOverrideEffect(assignment, path) === 'deny',
  })

  if (assignment !== null) {
    enforceExplicitAllowOnlyModules(map, assignment)
  }

  return map
}

function enforceExplicitAllowOnlyModules(
  map: Record<string, boolean>,
  assignment: UserAccessAssignmentDoc
): void {
  for (const modPath of EXPLICIT_ALLOW_ONLY_MODULE_PATHS) {
    const mod = MODULES.find((m) => m.path === modPath)
    if (!mod) continue

    const paths = [mod.path, ...(mod.submodules || []).map((s) => s.path)]
    const hasExplicitAllow = paths.some((p) => viewOverrideEffect(assignment, p) === 'allow')
    if (hasExplicitAllow) continue

    for (const p of paths) {
      map[p] = false
    }
  }
}

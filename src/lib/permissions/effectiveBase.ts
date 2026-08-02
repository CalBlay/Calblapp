import { MODULES, getVisibleModules, type AccessUser } from '@/lib/accessControl'
import { normalizeRole } from '@/lib/roles'
import type { EffectiveBaseEntry } from '@/lib/permissions/types'

const EDIT_ROLES = new Set(['admin', 'direccio', 'cap', 'usuari', 'comercial'])

export function buildEffectiveBaseMap(user: AccessUser): Map<string, EffectiveBaseEntry> {
  const roleNorm = normalizeRole(user.role)
  const canEditByRole = EDIT_ROLES.has(roleNorm)
  const visibleModules = getVisibleModules(user)
  const visiblePaths = new Set<string>()

  for (const mod of visibleModules) {
    visiblePaths.add(mod.path)
    for (const sub of mod.submodules || []) {
      visiblePaths.add(sub.path)
    }
  }

  const map = new Map<string, EffectiveBaseEntry>()
  for (const mod of MODULES) {
    const view = visiblePaths.has(mod.path)
    map.set(mod.path, { view, edit: view && canEditByRole })
    for (const sub of mod.submodules || []) {
      const subView = visiblePaths.has(sub.path)
      map.set(sub.path, { view: subView, edit: subView && canEditByRole })
    }
  }
  return map
}

export function baseForPath(
  map: Map<string, EffectiveBaseEntry>,
  path: string
): EffectiveBaseEntry {
  const found = map.get(path)
  return { view: Boolean(found?.view), edit: Boolean(found?.edit) }
}

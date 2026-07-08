import type { ModuleDef } from '@/lib/accessControl'

/** Amaga el mòdul pare si cap submòdul és visible (llevat d'un allow explícit al pare). */
export function finalizeModuleVisibilityMap(
  map: Record<string, boolean>,
  modules: ModuleDef[],
  options?: {
    isParentExplicitlyAllowed?: (path: string) => boolean
    isParentExplicitlyDenied?: (path: string) => boolean
  }
): void {
  const isAllowed = options?.isParentExplicitlyAllowed ?? (() => false)
  const isDenied = options?.isParentExplicitlyDenied ?? (() => false)

  for (const mod of modules) {
    const subs = mod.submodules || []
    if (subs.length === 0) continue

    if (isDenied(mod.path)) {
      map[mod.path] = false
      continue
    }

    const anySubVisible = subs.some((sub) => map[sub.path] === true)
    if (!anySubVisible && !isAllowed(mod.path)) {
      map[mod.path] = false
    }
  }
}

/** Enllaç del tile del menú: si només hi ha un submòdul visible, obre directament aquest. */
export function resolveModuleMenuHref(
  mod: ModuleDef,
  uiMap: Record<string, boolean>
): string {
  // Incidencies has its default weekly board at the parent route.
  // If the parent screen is visible, prefer it instead of auto-entering
  // the only visible submodule ("Les meves accions").
  if (mod.path === '/menu/incidents' && uiMap[mod.path] === true) {
    return mod.path
  }

  const visibleSubs = (mod.submodules || []).filter((sub) => uiMap[sub.path] === true)
  if (visibleSubs.length === 1) {
    return visibleSubs[0].path
  }
  return mod.path
}

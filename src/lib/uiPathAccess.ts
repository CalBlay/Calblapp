/**
 * UI path blocking uses the most specific matching catalog path.
 * A denied parent must not block a child path explicitly allowed via overrides.
 */
const ALWAYS_ALLOWED_UI_PATHS = ['/menu/configuracio']
const SETTINGS_UI_PATH = '/menu/settings'

function isAlwaysAllowedUiPath(pathname: string): boolean {
  const path = String(pathname || '').trim()
  return ALWAYS_ALLOWED_UI_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

export function matchingUiPaths(pathname: string, uiMap: Record<string, boolean>): string[] {
  const path = String(pathname || '').trim()
  if (!path) return []
  return Object.keys(uiMap).filter((p) => path === p || path.startsWith(`${p}/`))
}

export function isUiPathBlocked(pathname: string, uiMap: Record<string, boolean>): boolean {
  const matches = matchingUiPaths(pathname, uiMap)
  if (matches.length === 0) return false
  matches.sort((a, b) => b.length - a.length)
  return uiMap[matches[0]] === false
}

export function isUiPathAllowed(pathname: string, uiMap: Record<string, boolean>): boolean {
  const path = String(pathname || '').trim()
  if (!path) return false
  if (isAlwaysAllowedUiPath(path)) return true
  const matches = matchingUiPaths(path, uiMap)
  if (matches.length === 0) return false
  matches.sort((a, b) => b.length - a.length)
  if (uiMap[matches[0]] === true) return true
  if (uiMap[matches[0]] === false) return false
  if (path.startsWith(`${SETTINGS_UI_PATH}/`) && uiMap[SETTINGS_UI_PATH] === true) {
    return true
  }
  return false
}

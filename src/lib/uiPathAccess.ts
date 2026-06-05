/**
 * UI path blocking uses the most specific matching catalog path.
 * A denied parent must not block a child path explicitly allowed via overrides.
 */
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
  const matches = matchingUiPaths(path, uiMap)
  if (matches.length === 0) return false
  matches.sort((a, b) => b.length - a.length)
  return uiMap[matches[0]] === true
}

import { PERM } from '@/lib/permissionKeys'
import { buildMatrixRows, PERMISSION_ACTION_GROUPS } from '@/lib/permissions/matrixConfig'

export type BulkPermissionUpdate = {
  permission: string
  effect: 'allow' | 'deny' | null
}

const validPaths = new Set(buildMatrixRows().map((row) => row.path))
const validActionPermissions = new Set(
  PERMISSION_ACTION_GROUPS.flatMap((group) => group.actions.map((action) => action.key))
)

export function parseBulkPermissionOperation(operation: unknown): BulkPermissionUpdate[] | null {
  if (!operation || typeof operation !== 'object') return null
  const input = operation as Record<string, unknown>

  if (input.kind === 'access') {
    const path = String(input.path || '').trim()
    const level = String(input.level || '')
    if (!validPaths.has(path) || !['none', 'view', 'edit', 'base'].includes(level)) return null

    if (level === 'base') {
      return [
        { permission: PERM.view(path), effect: null },
        { permission: PERM.edit(path), effect: null },
      ]
    }
    if (level === 'edit') {
      return [
        { permission: PERM.view(path), effect: 'allow' },
        { permission: PERM.edit(path), effect: 'allow' },
      ]
    }
    if (level === 'view') {
      return [
        { permission: PERM.view(path), effect: 'allow' },
        { permission: PERM.edit(path), effect: 'deny' },
      ]
    }
    return [
      { permission: PERM.view(path), effect: 'deny' },
      { permission: PERM.edit(path), effect: 'deny' },
    ]
  }

  if (input.kind === 'action') {
    const permission = String(input.permission || '').trim()
    const effect = String(input.effect || '')
    if (!validActionPermissions.has(permission) || !['allow', 'deny', 'base'].includes(effect)) {
      return null
    }
    return [
      {
        permission,
        effect: effect === 'base' ? null : (effect as 'allow' | 'deny'),
      },
    ]
  }

  return null
}

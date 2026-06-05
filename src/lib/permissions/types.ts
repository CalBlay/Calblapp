import type { Role } from '@/lib/roles'

export type AssignmentOverride = {
  permission: string
  effect: 'allow' | 'deny'
  scope: 'client' | 'centre' | 'project'
  scopeId?: string | null
  note?: string | null
}

export type UserAccessAssignmentInput = {
  overrides?: AssignmentOverride[]
  base?: { role?: Role; department?: string | null }
  permissionSets?: string[]
}

/** Document Firestore `user_access_assignments` (o equivalent per calcular permisos UI). */
export type UserAccessAssignmentDoc = UserAccessAssignmentInput | null

export type EffectiveBaseEntry = {
  view: boolean
  edit: boolean
}

export type MatrixRow = {
  key: string
  label: string
  path: string
  level: 'module' | 'submodule'
}

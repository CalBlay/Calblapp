import { normalizeRole } from '@/lib/roles'

export type BootstrapAssignmentUser = {
  id?: unknown
  role?: unknown
  department?: unknown
}

export type BootstrapAssignmentUpdate = {
  userId: string
  base: {
    role: ReturnType<typeof normalizeRole>
    department: string | null
  }
  updatedAt: string
  updatedBy: string
}

export function buildBootstrapAssignmentUpdate(
  user: BootstrapAssignmentUser,
  updatedBy: string,
  updatedAt: string
): BootstrapAssignmentUpdate | null {
  const userId = String(user.id || '').trim()
  if (!userId) return null

  const role = normalizeRole(typeof user.role === 'string' ? user.role : undefined)
  const department =
    typeof user.department === 'string' && user.department.trim()
      ? user.department.trim()
      : null

  return {
    userId,
    base: {
      role,
      department,
    },
    updatedAt,
    updatedBy,
  }
}

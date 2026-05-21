import { canAccessProjectsModule, type AccessUser } from '@/lib/accessControl'

export function canAccessProjects(user?: AccessUser | null) {
  return canAccessProjectsModule(user)
}

/** Converteix usuari de sessió API en AccessUser per comprovacions de projectes. */
export function sessionToAccessUser(user: {
  role?: string | null
  department?: string | null
  opsProjectsConfigurable?: boolean
}): AccessUser {
  return {
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    opsProjectsConfigurable: user.opsProjectsConfigurable,
  }
}

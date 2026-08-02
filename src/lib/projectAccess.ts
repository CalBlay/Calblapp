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

export function sessionToRoomAccessUser(user: {
  id?: string | null
  name?: string | null
  role?: string | null
}): import('@/lib/projectRoomAccess').RoomAccessUser {
  return {
    id: String(user.id || '').trim(),
    name: String(user.name || '').trim(),
    role: String(user.role || '').trim(),
  }
}

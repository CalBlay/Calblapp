import { canAccessProjectsModule, type AccessUser } from '@/lib/accessControl'

export function canAccessProjects(user?: AccessUser | null) {
  return canAccessProjectsModule(user)
}

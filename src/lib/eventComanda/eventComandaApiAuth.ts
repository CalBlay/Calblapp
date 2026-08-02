import type { AccessUser } from '@/lib/accessControl'
import type { SessionUserForApi } from '@/lib/server/apiAuth'

export function eventComandaAccessUserFromSession(
  user: SessionUserForApi
): AccessUser & { id: string } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    opsProjectsConfigurable:
      typeof user.opsProjectsConfigurable === 'boolean'
        ? user.opsProjectsConfigurable
        : undefined,
    isTransportLead: Boolean(user.isTransportLead),
  }
}

import type { AccessUser } from '@/lib/accessControl'

export function accessUserFromSession(user: {
  id: string
  role?: string | null
  department?: string | null
  canRespondSurveys?: boolean | null
  isDepartmentRobaLead?: boolean | null
  robaLinkedPersonnelId?: string | null
  email?: string | null
  name?: string | null
}): AccessUser & { id: string; email?: string | null; name?: string | null } {
  return {
    id: user.id,
    role: user.role ?? undefined,
    department: user.department ?? undefined,
    canRespondSurveys: Boolean(user.canRespondSurveys),
    isDepartmentRobaLead: Boolean(user.isDepartmentRobaLead),
    robaLinkedPersonnelId: user.robaLinkedPersonnelId ?? null,
    email: user.email ?? null,
    name: user.name ?? null,
  }
}

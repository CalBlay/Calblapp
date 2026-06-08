import type { AssignmentOverride, UserAccessAssignmentDoc } from '@/lib/permissions/types'

/** Opcions operatives copiables (no identitat ni credencials). */
export type UserConfigTemplateProfile = {
  opsChannelsConfigurable: string[]
  opsEventsConfigurable: boolean
  opsProjectsConfigurable: boolean
  canRespondSurveys: boolean
  isDepartmentRobaLead: boolean
  isTransportLead: boolean
  available: boolean
  isDriver: boolean
  workerRank: string
}

export type UserConfigTemplate = {
  sourceUserId: string
  sourceName: string
  overrides: AssignmentOverride[]
  profile: UserConfigTemplateProfile
}

function readBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(String).map((s) => s.trim()).filter(Boolean)
}

function parseOverrides(raw: unknown): AssignmentOverride[] {
  if (!Array.isArray(raw)) return []
  const out: AssignmentOverride[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const permission = String(o.permission ?? '').trim()
    if (!permission) continue
    const effect: AssignmentOverride['effect'] =
      String(o.effect ?? 'allow') === 'deny' ? 'deny' : 'allow'
    const scopeRaw = String(o.scope ?? 'client')
    const scope: AssignmentOverride['scope'] =
      scopeRaw === 'centre' || scopeRaw === 'project' ? scopeRaw : 'client'
    const scopeId =
      o.scopeId != null && o.scopeId !== '' ? String(o.scopeId).trim() : null
    const note = o.note != null && o.note !== '' ? String(o.note).trim() : null
    out.push({ permission, effect, scope, scopeId, note })
  }
  return out
}

export function extractUserConfigTemplate(
  sourceUserId: string,
  userData: Record<string, unknown>,
  assignment: UserAccessAssignmentDoc
): UserConfigTemplate {
  const sourceName = String(userData.name ?? userData.email ?? sourceUserId).trim()
  const driver =
    userData.driver && typeof userData.driver === 'object'
      ? (userData.driver as Record<string, unknown>)
      : null

  return {
    sourceUserId,
    sourceName,
    overrides: parseOverrides(assignment?.overrides),
    profile: {
      opsChannelsConfigurable: readStringArray(userData.opsChannelsConfigurable),
      opsEventsConfigurable: readBool(userData.opsEventsConfigurable),
      opsProjectsConfigurable: readBool(userData.opsProjectsConfigurable, true),
      canRespondSurveys: readBool(userData.canRespondSurveys),
      isDepartmentRobaLead: readBool(userData.isDepartmentRobaLead),
      isTransportLead: readBool(userData.isTransportLead),
      available: readBool(userData.available, true),
      isDriver: readBool(driver?.isDriver ?? userData.isDriver),
      workerRank: String(userData.workerRank ?? 'equip').trim() || 'equip',
    },
  }
}

export function cloneAssignmentOverrides(
  overrides: AssignmentOverride[]
): AssignmentOverride[] {
  return overrides.map((o) => ({ ...o }))
}

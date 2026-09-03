import { normalizeRole } from '@/lib/roles'

export const INCIDENT_ACTION_ASSIGNEE_FIELD = 'canBeIncidentActionAssignee'

/**
 * Els caps de departament sempre poden rebre accions. La casella permet afegir
 * qualsevol altre usuari al selector del seu departament.
 */
export function canBeIncidentActionAssignee(user: Record<string, unknown>): boolean {
  if (normalizeRole(String(user.role || '')) === 'cap') return true
  return user[INCIDENT_ACTION_ASSIGNEE_FIELD] === true
}

/**
 * El llistat de Permisos (`PUT` sense la clau) no pot apagar el flag.
 * Només el detall d’usuari envia `canBeIncidentActionAssignee` explícitament.
 */
export function incidentActionAssigneeUserPatch(
  body: Record<string, unknown> | null | undefined
): { canBeIncidentActionAssignee: boolean } | null {
  if (!body || !Object.prototype.hasOwnProperty.call(body, INCIDENT_ACTION_ASSIGNEE_FIELD)) {
    return null
  }
  return {
    canBeIncidentActionAssignee: body[INCIDENT_ACTION_ASSIGNEE_FIELD] === true,
  }
}

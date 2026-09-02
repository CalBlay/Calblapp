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

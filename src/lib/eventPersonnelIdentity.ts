const normalizeIdentityPart = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export type EventPersonnelIdentity = {
  id?: string
  name?: string
  department?: string
}

/**
 * Manté separades les línies amb identificador propi (com els treballadors ETT),
 * però continua deduplicant les línies històriques que només tenen nom.
 */
export function eventPersonnelIdentityKey(person: EventPersonnelIdentity): string {
  const department = normalizeIdentityPart(person.department)
  const id = normalizeIdentityPart(person.id)
  if (id) return `${department}|id:${id}`
  return `${department}|name:${normalizeIdentityPart(person.name)}`
}

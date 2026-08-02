const unaccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

export const normPersonRole = (role?: string | null) => {
  const raw = unaccent(String(role ?? '').trim().toLowerCase())
  return raw === 'soldat' ? 'equip' : raw
}

/** Rols de personal considerats responsables de departament / equip. */
export const RESPONSABLE_ROLES = new Set([
  'responsable',
  'cap departament',
  'capdepartament',
  'supervisor',
])

/** Certifica si una persona pot assignar-se com a responsable de quadrant. */
export function isResponsiblePerson(
  person?: { isResponsible?: boolean; role?: string | null } | null
): boolean {
  if (!person) return false
  if (person.isResponsible === true) return true
  return RESPONSABLE_ROLES.has(normPersonRole(person.role))
}

import type { ServeiGroupRoleLine } from '../phaseConfig'

export type PersonnelPoolRef = { id: string; name: string }

const normName = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Resol `personId` a partir del nom quan el borrador només en té el text (Firestore legacy). */
export function resolveRoleLinesPersonIds(
  lines: ServeiGroupRoleLine[],
  pools: PersonnelPoolRef[]
): ServeiGroupRoleLine[] {
  if (!lines.length || !pools.length) return lines

  const byId = new Map<string, PersonnelPoolRef>()
  const byName = new Map<string, PersonnelPoolRef>()
  for (const person of pools) {
    const id = String(person.id || '').trim()
    if (id && !byId.has(id)) byId.set(id, person)
    const nameKey = normName(person.name)
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, person)
  }

  return lines.map((line) => {
    const pid = String(line.personId || '').trim()
    if (pid && byId.has(pid)) {
      return { ...line, personName: byId.get(pid)!.name || line.personName }
    }

    const nameKey = normName(line.personName)
    if (nameKey && byName.has(nameKey)) {
      const hit = byName.get(nameKey)!
      return { ...line, personId: hit.id, personName: hit.name }
    }

    return line
  })
}

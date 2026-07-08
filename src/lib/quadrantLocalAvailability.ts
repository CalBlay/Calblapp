/**
 * Disponibilitat de personal en un quadrant en edició — dues capes:
 * 1) Local: la persona no pot repetir-se en una altra línia del mateix formulari.
 * 2) Externa: `/api/personnel/available` (altres quadrants) — s'aplica després del pas 1.
 */

import {
  findDuplicateRoleLinePersonKeys,
  isPersonReservedForRoleLine,
  linesShareSamePerson,
  normalizeRoleLinePersonKey,
  type RoleLineReservation,
} from '@/app/menu/quadrants/[id]/lib/quadrantPayloadShared'

export const LOCAL_QUADRANT_PERSON_CONFLICT = 'local_quadrant_person_duplicate'

export type AssignablePersonOption = {
  id?: string
  name?: string
}

/** Pas 1: filtra el pool després de comprovar assignacions dins el mateix quadrant. */
export function filterPersonnelAfterLocalQuadrantCheck<T extends AssignablePersonOption>(
  pool: T[],
  reservedInQuadrant: Set<string>,
  currentLine?: { personId?: string; personName?: string }
): T[] {
  return pool.filter((person) => {
    const pid = normalizeRoleLinePersonKey(person.id)
    if (!pid) return false

    if (currentLine) {
      if (normalizeRoleLinePersonKey(currentLine.personId) === pid) return true
      if (
        linesShareSamePerson(currentLine, {
          personId: person.id,
          personName: person.name,
        })
      ) {
        return true
      }
    }

    return !isPersonReservedForRoleLine(person, reservedInQuadrant)
  })
}

export function validateNoLocalQuadrantPersonDuplicates(
  lines: RoleLineReservation[]
): string | null {
  const duplicates = findDuplicateRoleLinePersonKeys(lines)
  if (duplicates.length === 0) return null
  return 'Una persona no pot estar assignada en més d\'una línia del mateix quadrant (mateix dia i horari).'
}

export function collectLocalExcludeIdsAndNames(
  lines: RoleLineReservation[],
  excludeSlotId?: string
): { excludeIds: string[]; excludeNames: string[] } {
  const excludeIds: string[] = []
  const excludeNames: string[] = []

  for (const line of lines) {
    if (excludeSlotId && line.slotId === excludeSlotId) continue
    const id = String(line.personId || '').trim()
    const name = String(line.personName || '').trim()
    if (id) excludeIds.push(id)
    else if (name) excludeNames.push(name)
  }

  return { excludeIds, excludeNames }
}

export type MergeableQuadrantPerson = {
  id?: string | null
  name?: string | null
  meetingPoint?: string | null
  startDate?: string | null
  startTime?: string | null
  endTime?: string | null
  isExternal?: boolean | null
  externalType?: string | null
  groupId?: string | null
  ettGroupKey?: string | null
  [key: string]: unknown
}

const normalize = (value?: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

const isExternalPerson = (person: MergeableQuadrantPerson) =>
  person.isExternal === true || Boolean(String(person.externalType || '').trim())

/**
 * Fusiona personal de documents germans del mateix esdeveniment.
 * Els interns es dedupliquen per nom/punt; els externs conserven cada plaça
 * individual (ETT-1, ETT-2...) i només eliminen còpies del mateix id.
 */
export function mergeQuadrantPeople<T extends MergeableQuadrantPerson>(groups: T[][]): T[] {
  const merged: T[] = []
  const seen = new Set<string>()

  groups.forEach((group) => {
    const externalOccurrences = new Map<string, number>()

    group.forEach((person) => {
      if (!person?.name) return

      let key: string
      if (isExternalPerson(person)) {
        const id = String(person.id || '').trim()
        if (id) {
          key = `external-id:${id}`
        } else {
          const signature = [
            person.ettGroupKey || person.groupId,
            person.externalType,
            person.name,
            person.meetingPoint,
            person.startDate,
            person.startTime,
            person.endTime,
          ]
            .map(normalize)
            .join('|')
          const occurrence = (externalOccurrences.get(signature) || 0) + 1
          externalOccurrences.set(signature, occurrence)
          key = `external-slot:${signature}:${occurrence}`
        }
      } else {
        key = `internal:${normalize(person.name)}__${normalize(person.meetingPoint)}`
      }

      if (seen.has(key)) return
      seen.add(key)
      merged.push(person)
    })
  })

  return merged
}

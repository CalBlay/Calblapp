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
  role?: string
}

export type EventPersonnelDisplay = EventPersonnelIdentity & {
  displayName?: string
  externalType?: string
  isExternal?: boolean
  ettProviderName?: string
}

/**
 * Dona una etiqueta humana a cada plaça ETT sense canviar el nom intern que
 * s'utilitza per desar i relacionar el tancament.
 */
export function labelEttPersonnel<T extends EventPersonnelDisplay>(people: T[]): T[] {
  const counters = new Map<string, number>()
  return people.map((person) => {
    const isEtt =
      normalizeIdentityPart(person.externalType) === 'ett' ||
      (person.isExternal === true && normalizeIdentityPart(person.name).startsWith('ett'))
    if (!isEtt) return person

    const department = normalizeIdentityPart(person.department)
    const number = (counters.get(department) || 0) + 1
    counters.set(department, number)
    const provider = String(person.ettProviderName || '').trim()
    return {
      ...person,
      displayName: `ETT ${number}${provider ? ` · ${provider}` : ''}`,
    }
  })
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

/**
 * Al tancament, un responsable és una única persona de la fase encara que
 * provingui de documents de torn diferents amb identificadors diferents.
 */
export function closingPersonnelIdentityKey(person: EventPersonnelIdentity): string {
  if (normalizeIdentityPart(person.role) === 'responsable') {
    return `${normalizeIdentityPart(person.department)}|responsable:${normalizeIdentityPart(person.name)}`
  }
  return eventPersonnelIdentityKey(person)
}

type ResponsiblePersonnelSchedule = EventPersonnelIdentity & {
  time?: string
  plannedStartTime?: string
  endTime?: string
  sourceUpdatedAt: number
}

const earliest = (...values: Array<string | undefined>) =>
  values.filter((value): value is string => Boolean(value)).sort()[0] || ''

const latest = (...values: Array<string | undefined>) =>
  values.filter((value): value is string => Boolean(value)).sort().at(-1) || ''

export function mergeResponsiblePersonnelSchedules<T extends ResponsiblePersonnelSchedule>(
  current: T,
  incoming: T
): T {
  const preferred =
    incoming.sourceUpdatedAt >= current.sourceUpdatedAt ? incoming : current
  return {
    ...current,
    ...incoming,
    ...preferred,
    role: 'responsable',
    time: earliest(current.time, incoming.time) || undefined,
    plannedStartTime:
      earliest(current.plannedStartTime || current.time, incoming.plannedStartTime || incoming.time) ||
      undefined,
    endTime: latest(current.endTime, incoming.endTime) || undefined,
    sourceUpdatedAt: Math.max(current.sourceUpdatedAt, incoming.sourceUpdatedAt),
  }
}

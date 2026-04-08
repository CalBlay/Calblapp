// src/utils/calculatePersonalNeeded.ts

export type Driver = { name: string } | string

export interface PersonalRow {
  /** A cuina / logística: total combinat. A Serveis (amb calculateServeisStaffSlots): total de **persones** del grup (resp i conductor inclosos en el mateix número). */
  staffCount: number
  /** Llista de conductors (només nom) */
  drivers: Driver[]
  /** Nom del responsable (pot ser null si encara no s’ha assignat) */
  responsableName?: string | null
  /** Nombre de conductors sol·licitats explícitament (p. ex. del quadrant) */
  requestedDrivers?: number
}

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string | null) => unaccent((s || '').toLowerCase().trim())
const getName = (d: Driver) => (typeof d === 'string' ? d : d.name)

/**
 * Treballadors a assignar = staffCount - (conductors + responsable)
 * Es resta com a mínim el nombre de conductors sol·licitats i també s'ajusta
 * perquè no es compti doble si el responsable també actua de conductor.
 */
export function calculatePersonalNeeded(row: PersonalRow): number {
  const total = Number(row.staffCount) || 0
  const drivers = Array.isArray(row.drivers) ? row.drivers : []
  const numDrivers = drivers.length

  const resp = norm(row.responsableName || '')
  const responsableIsDriver = !!resp && drivers.some(d => norm(getName(d)) === resp)
  const driversReals = numDrivers - (responsableIsDriver ? 1 : 0)

  const requestedDrivers =
    typeof row.requestedDrivers === 'number' && !Number.isNaN(row.requestedDrivers)
      ? Math.max(0, row.requestedDrivers)
      : driversReals
  const driversToSubtract = Math.max(driversReals, requestedDrivers)

  const hasResponsible = !!resp
  const needed = total - (driversToSubtract + (hasResponsible ? 1 : 0))
  return needed > 0 ? needed : 0
}

/**
 * Serveis: `staffCount` és el **total de persones** del grup (inclou responsable i conductor dins d’aquest número).
 * Retorna quantes línies de «treballador» (staff) calen després d’assignar responsable + conductors,
 * sense comptar dues vegades la mateixa persona (p. ex. Luis resp + conductor → 1 sol).
 */
export function calculateServeisStaffSlots(
  row: Pick<PersonalRow, 'staffCount' | 'drivers' | 'responsableName'>
): number {
  const total = Math.max(0, Number(row.staffCount) || 0)
  const drivers = Array.isArray(row.drivers) ? row.drivers : []
  const names = new Set<string>()
  const resp = norm(row.responsableName || '')
  if (resp) names.add(resp)
  for (const d of drivers) {
    const n = norm(getName(d))
    if (n) names.add(n)
  }
  return Math.max(0, total - names.size)
}

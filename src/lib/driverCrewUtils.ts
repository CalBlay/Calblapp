import type { DriverCrewPremise } from '@/services/premises'

const norm = (value?: string | null) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

export type CrewMemberRef = { id: string; name: string }

export function findDriverCrewForPerson(
  driverId: string | undefined,
  driverName: string | undefined,
  driverCrews: DriverCrewPremise[] | undefined
): DriverCrewPremise | null {
  if (!Array.isArray(driverCrews) || driverCrews.length === 0) return null
  const pid = norm(driverId)
  const pname = norm(driverName)
  if (!pid && !pname) return null

  return (
    driverCrews.find((crew) => {
      if (pid && norm(crew.driverId) === pid) return true
      if (pname && norm(crew.driverName) === pname) return true
      return false
    }) ?? null
  )
}

export function getCrewMembersForDriver(
  driverId: string | undefined,
  driverName: string | undefined,
  driverCrews: DriverCrewPremise[] | undefined
): CrewMemberRef[] {
  const crew = findDriverCrewForPerson(driverId, driverName, driverCrews)
  if (!crew) return []
  return (crew.companions || []).map((companion) => ({
    id: String(companion.id || '').trim(),
    name: String(companion.name || '').trim(),
  }))
}

export function isCrewMember(
  person: { id: string; name: string },
  crewMembers: CrewMemberRef[]
): boolean {
  if (!crewMembers.length) return false
  const pid = norm(person.id)
  const pname = norm(person.name)
  return crewMembers.some((member) => {
    const mid = norm(member.id)
    const mname = norm(member.name)
    if (pid && mid && pid === mid) return true
    if (pname && mname && pname === mname) return true
    return false
  })
}

export function sortPeopleWithCrewFirst<T extends { id: string; name: string }>(
  people: T[],
  crewMembers: CrewMemberRef[]
): T[] {
  if (!crewMembers.length) return people

  const crewOrder = new Map<string, number>()
  crewMembers.forEach((member, index) => {
    const id = norm(member.id)
    const name = norm(member.name)
    if (id) crewOrder.set(id, index)
    if (name) crewOrder.set(`name:${name}`, index)
  })

  const getOrder = (person: T) => {
    const id = norm(person.id)
    if (id && crewOrder.has(id)) return crewOrder.get(id)!
    const name = norm(person.name)
    if (name && crewOrder.has(`name:${name}`)) return crewOrder.get(`name:${name}`)!
    return Number.POSITIVE_INFINITY
  }

  return [...people].sort((a, b) => {
    // Compare ranks directly: Infinity - Infinity is NaN and would skip locale sort.
    const orderA = getOrder(a)
    const orderB = getOrder(b)
    if (orderA !== orderB) return orderA - orderB
    return a.name.localeCompare(b.name, 'ca')
  })
}

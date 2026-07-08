import { norm } from '@/lib/quadrantsPost/utils'
import { LOCAL_QUADRANT_PERSON_CONFLICT } from '@/lib/quadrantLocalAvailability'
import type {
  JamoneroAssignmentNormalized,
  ServeisGroupInput,
} from '@/lib/quadrantsPost/types'

export type DepartmentPersonLite = {
  id?: string
  name?: string
  isJamonero?: boolean
  isDriver?: boolean
}

/** Cerca per id i nom normalitzat sense recórrer la llista a cada crida (manual fast path). */
export function makeDepartmentPersonFinder(people: DepartmentPersonLite[]) {
  const byId = new Map<string, DepartmentPersonLite>()
  const byNormName = new Map<string, DepartmentPersonLite>()
  for (const person of people) {
    const idStr = String(person.id || '').trim()
    if (idStr && !byId.has(idStr)) byId.set(idStr, person)
    const nameKey = norm(String(person.name || ''))
    if (nameKey && !byNormName.has(nameKey)) byNormName.set(nameKey, person)
  }
  return (id?: string | null, nameHint?: string | null): DepartmentPersonLite | null => {
    const idStr = id ? String(id).trim() : ''
    if (idStr) {
      const hit = byId.get(idStr)
      if (hit?.name) return hit
    }
    if (nameHint) {
      const nh = norm(String(nameHint))
      if (!nh) return null
      return byNormName.get(nh) || null
    }
    return null
  }
}

/** Mode manual Serveis després d'autoAssign: sense treballadors "auto", només triats manualment + auto jamoneros. */
export function applyManualServeisStaffPolicy(
  assignment: {
    responsible?: { name: string } | null
    drivers?: Array<{
      name: string
      meetingPoint?: string
      plate?: string
      vehicleType?: string
      isJamonero?: boolean
    }>
    staff?: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
  },
  groups: ServeisGroupInput[],
  departmentPeople: DepartmentPersonLite[],
  phaseServiceJamoneros: JamoneroAssignmentNormalized[],
  fallbackMeetingPoint: string
) {
  const meeting = fallbackMeetingPoint
  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  const isJamoneroPerson = (p: DepartmentPersonLite | null, displayName: string) => {
    if (p?.isJamonero === true) return true
    const nn = norm(displayName)
    return phaseServiceJamoneros.some(
      (j) =>
        j.mode === 'manual' &&
        ((j.personnelId && p?.id && String(j.personnelId) === String(p.id)) ||
          (j.personnelName && norm(String(j.personnelName)) === nn))
    )
  }

  const manualStaff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const seenManualNorm = new Set<string>()

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    const mw = g.manualWorkers
    if (!Array.isArray(mw)) continue
    for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
      const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
      const name = String((p?.name || w?.name || '').trim())
      if (!name) continue
      const nn = norm(name)
      if (seenManualNorm.has(nn)) continue
      seenManualNorm.add(nn)
      manualStaff.push({
        name,
        meetingPoint: String(w?.meetingPoint || gMp || meeting),
        isJamonero: isJamoneroPerson(p, name) || undefined,
      })
    }
  }

  const jamoneroAutoStaff = (assignment.staff || []).filter(
    (s) => s?.name && String(s.name).trim() && s.isJamonero === true
  )

  const merged: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = [...manualStaff]
  const seenNorm = new Set(seenManualNorm)
  for (const row of jamoneroAutoStaff) {
    const nn = norm(String(row.name))
    if (!nn || seenNorm.has(nn)) continue
    seenNorm.add(nn)
    merged.push(row)
  }

  return {
    ...assignment,
    staff: merged,
  }
}

/** Sense autoAssign ni ledger: només camps del formulari per Serveis manual (sense slots jamonero auto). */
export function buildServeisManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[],
  phaseServiceJamoneros: JamoneroAssignmentNormalized[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
    staff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')
  const skipResponsible = phaseAssignBody.skipResponsible === true

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  const isJamoneroPerson = (p: DepartmentPersonLite | null, displayName: string) => {
    if (p?.isJamonero === true) return true
    const nn = norm(displayName)
    return phaseServiceJamoneros.some(
      (j) =>
        j.mode === 'manual' &&
        ((j.personnelId && p?.id && String(j.personnelId) === String(p.id)) ||
          (j.personnelName && norm(String(j.personnelName)) === nn))
    )
  }

  let responsible: { name: string } | null = null
  const drivers: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const staff: Array<{ name: string; meetingPoint?: string; isJamonero?: boolean }> = []
  const seenDriverNorm = new Set<string>()
  const seenStaffNorm = new Set<string>()
  const groups = Array.isArray(phaseAssignBody.groups)
    ? (phaseAssignBody.groups as ServeisGroupInput[])
    : []

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    if (!skipResponsible && g.wantsResponsible !== false && g.responsibleId) {
      const p = findPerson(
        String(g.responsibleId),
        typeof g.responsibleName === 'string' ? g.responsibleName : null
      )
      if (p?.name && !responsible) responsible = { name: String(p.name) }
    }
    if (g.needsDriver && g.driverId) {
      const p = findPerson(
        String(g.driverId),
        typeof g.driverName === 'string' ? g.driverName : null
      )
      if (p?.name) {
        const dn = norm(String(p.name))
        if (!seenDriverNorm.has(dn)) {
          seenDriverNorm.add(dn)
          drivers.push({
            name: String(p.name),
            meetingPoint: gMp,
            isJamonero: isJamoneroPerson(p, String(p.name)) || undefined,
          })
        }
      }
    }
    const mw = g.manualWorkers
    if (!Array.isArray(mw)) continue
    for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
      const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
      const name = String((p?.name || w?.name || '').trim())
      if (!name) continue
      const nn = norm(name)
      if (seenStaffNorm.has(nn)) continue
      seenStaffNorm.add(nn)
      staff.push({
        name,
        meetingPoint: String(w?.meetingPoint || gMp || meeting),
        isJamonero: isJamoneroPerson(p, name) || undefined,
      })
    }
  }

  const topRespId =
    typeof phaseAssignBody.manualResponsibleId === 'string'
      ? phaseAssignBody.manualResponsibleId.trim()
      : ''
  if (!skipResponsible && !responsible && topRespId) {
    const p = findPerson(topRespId, null)
    if (p?.name) responsible = { name: String(p.name) }
  }

  const manualDriverId =
    typeof phaseAssignBody.manualDriverId === 'string' ? String(phaseAssignBody.manualDriverId).trim() : ''
  if (manualDriverId) {
    const p = findPerson(manualDriverId, null)
    if (p?.name) {
      const dn = norm(String(p.name))
      if (!seenDriverNorm.has(dn)) {
        seenDriverNorm.add(dn)
        drivers.push({
          name: String(p.name),
          meetingPoint: meeting,
          isJamonero: isJamoneroPerson(p, String(p.name)) || undefined,
        })
      }
    }
  }

  for (const j of phaseServiceJamoneros) {
    if (j.mode !== 'manual') continue
    const p = j.personnelId
      ? findPerson(String(j.personnelId), j.personnelName ? String(j.personnelName) : null)
      : findPerson(null, j.personnelName ? String(j.personnelName) : null)
    const name = String((p?.name || j.personnelName || '').trim())
    if (!name) continue
    const nn = norm(name)

    const existingDriver = drivers.find((d) => norm(d.name) === nn)
    const existingStaff = staff.find((s) => norm(s.name) === nn)
    if (existingDriver) {
      existingDriver.isJamonero = true
      continue
    }
    if (existingStaff) {
      existingStaff.isJamonero = true
      continue
    }

    if (p?.isDriver === true) {
      if (!seenDriverNorm.has(nn)) {
        seenDriverNorm.add(nn)
        drivers.push({ name, meetingPoint: meeting, isJamonero: true })
      }
    } else {
      if (!seenStaffNorm.has(nn)) {
        seenStaffNorm.add(nn)
        staff.push({ name, meetingPoint: meeting, isJamonero: true })
      }
    }
  }

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: false, violations: [], notes: [] },
  }
}

/** Manual Cuina: IDs i noms dels grups → assignació sense autoAssign ni ledger. */
export function buildCuinaManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  let responsible: { name: string } | null = null
  const drivers: Array<{
    name: string
    meetingPoint?: string
    plate?: string
    vehicleType?: string
  }> = []
  const staff: Array<{ name: string; meetingPoint?: string }> = []
  const seenDriverNorm = new Set<string>()
  const seenStaffNorm = new Set<string>()
  const groups = Array.isArray(phaseAssignBody.groups)
    ? (phaseAssignBody.groups as ServeisGroupInput[])
    : []

  const vehicles = Array.isArray(phaseAssignBody.vehicles)
    ? (phaseAssignBody.vehicles as Array<{
        conductorId?: string | null
        plate?: unknown
        vehicleType?: unknown
      }>)
    : []

  for (const v of vehicles) {
    const cid = v.conductorId ? String(v.conductorId).trim() : ''
    if (!cid) continue
    const p = findPerson(cid, null)
    if (!p?.name) continue
    const dn = norm(String(p.name))
    if (seenDriverNorm.has(dn)) continue
    seenDriverNorm.add(dn)
    drivers.push({
      name: String(p.name),
      meetingPoint: meeting,
      plate: String(v.plate || ''),
      vehicleType: String(v.vehicleType || ''),
    })
  }

  for (const g of groups) {
    const gMp = String(g.meetingPoint || meeting || '')
    if (g.wantsResponsible !== false) {
      const rid = String(g.responsibleId || '').trim()
      const p = findPerson(rid || null, typeof g.responsibleName === 'string' ? g.responsibleName : null)
      if (p?.name && !responsible) responsible = { name: String(p.name) }
    }
    const nd = Number(g.drivers || 0)
    const needsDriver = g.needsDriver === true || nd > 0
    if (needsDriver) {
      const did = String(g.driverId || '').trim()
      const p = findPerson(did || null, typeof g.driverName === 'string' ? g.driverName : null)
      if (p?.name) {
        const dn = norm(String(p.name))
        if (!seenDriverNorm.has(dn)) {
          seenDriverNorm.add(dn)
          const vehicle = vehicles.find((entry) => String(entry.conductorId || '').trim() === did)
          drivers.push({
            name: String(p.name),
            meetingPoint: gMp,
            plate: String(vehicle?.plate || ''),
            vehicleType: String(vehicle?.vehicleType || ''),
          })
        }
      }
    }

    const mw = g.manualWorkers
    if (Array.isArray(mw)) {
      for (const w of mw as Array<{ id?: string; name?: string; meetingPoint?: string }>) {
        const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
        const name = String((p?.name || w?.name || '').trim())
        if (!name) continue
        const nn = norm(name)
        if (seenStaffNorm.has(nn)) continue
        if (responsible && nn === norm(responsible.name)) continue
        if (seenDriverNorm.has(nn)) continue
        seenStaffNorm.add(nn)
        staff.push({
          name,
          meetingPoint: String(w?.meetingPoint || gMp || meeting),
        })
      }
    }
  }

  const topRespId =
    typeof phaseAssignBody.manualResponsibleId === 'string'
      ? phaseAssignBody.manualResponsibleId.trim()
      : ''
  if (!responsible && topRespId) {
    const p = findPerson(topRespId, null)
    if (p?.name) responsible = { name: String(p.name) }
  }

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: false, violations: [], notes: [] },
  }
}

/** Manual Logística: responsable + conductors per vehicle; personal extra co omple amb buildQuadrantSave. */
export function buildLogisticaManualAssignmentOnly(
  phaseAssignBody: Record<string, unknown>,
  departmentPeople: DepartmentPersonLite[]
): {
  assignment: {
    responsible?: { name: string } | null
    drivers: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
    staff: Array<{ name: string; meetingPoint?: string }>
  }
  meta: { needsReview: boolean; violations: string[]; notes: string[] }
} {
  const meeting = String(phaseAssignBody.meetingPoint || '')
  const skipResponsible = phaseAssignBody.skipResponsible === true

  const findPerson = makeDepartmentPersonFinder(departmentPeople)

  let responsible: { name: string } | null = null
  if (!skipResponsible) {
    const rid = String(
      phaseAssignBody.manualResponsibleId || phaseAssignBody.responsableId || ''
    ).trim()
    if (rid) {
      const p = findPerson(rid, null)
      if (p?.name) responsible = { name: String(p.name) }
    }
  }

  const drivers: Array<{
    name: string
    meetingPoint?: string
    plate?: string
    vehicleType?: string
  }> = []
  const seenDriverNorm = new Set<string>()
  const violations: string[] = []
  const vehicles = Array.isArray(phaseAssignBody.vehicles)
    ? (phaseAssignBody.vehicles as Array<{
        conductorId?: string | null
        plate?: unknown
        vehicleType?: unknown
      }>)
    : []
  for (const v of vehicles) {
    const cid = v.conductorId ? String(v.conductorId).trim() : ''
    if (!cid) continue
    const p = findPerson(cid, null)
    if (!p?.name) continue
    const dn = norm(String(p.name))
    if (seenDriverNorm.has(dn)) {
      if (!violations.includes(LOCAL_QUADRANT_PERSON_CONFLICT)) {
        violations.push(LOCAL_QUADRANT_PERSON_CONFLICT)
      }
      continue
    }
    seenDriverNorm.add(dn)
    drivers.push({
      name: String(p.name),
      meetingPoint: meeting,
      plate: String(v.plate || ''),
      vehicleType: String(v.vehicleType || ''),
    })
  }

  const manualDriverId = String(phaseAssignBody.manualDriverId || '').trim()
  if (manualDriverId) {
    const p = findPerson(manualDriverId, null)
    if (p?.name) {
      const dn = norm(String(p.name))
      if (seenDriverNorm.has(dn)) {
        if (!violations.includes(LOCAL_QUADRANT_PERSON_CONFLICT)) {
          violations.push(LOCAL_QUADRANT_PERSON_CONFLICT)
        }
      } else {
        seenDriverNorm.add(dn)
        drivers.push({
          name: String(p.name),
          meetingPoint: meeting,
          plate: '',
          vehicleType: '',
        })
      }
    }
  }

  const tw = Number(phaseAssignBody.totalWorkers || 0)
  const nd = Number(phaseAssignBody.numDrivers || 0)
  const driverSlots = Math.max(nd, drivers.length)
  const respDeduction = !skipResponsible && responsible ? 1 : 0
  const staffCount = Math.max(tw - driverSlots - respDeduction, 0)

  const rawManualWorkers = Array.isArray(phaseAssignBody.manualWorkers)
    ? (
        phaseAssignBody.manualWorkers as Array<{
          id?: string
          name?: string
          meetingPoint?: string
        }>
      )
    : []

  const namedStaff: Array<{ name: string; meetingPoint?: string }> = []
  const namedNorm = new Set<string>()
  for (const w of rawManualWorkers) {
    if (namedStaff.length >= staffCount) break
    const p = findPerson(w?.id ? String(w.id) : null, w?.name ? String(w.name) : null)
    const name = String((p?.name || w?.name || '').trim())
    if (!name || name === 'Extra') continue
    const nn = norm(name)
    if (namedNorm.has(nn)) continue
    if (responsible && nn === norm(responsible.name)) continue
    if (seenDriverNorm.has(nn)) continue
    namedNorm.add(nn)
    namedStaff.push({
      name,
      meetingPoint: String(w?.meetingPoint || meeting),
    })
  }

  const extraSlots = Math.max(0, staffCount - namedStaff.length)
  const staff = [...namedStaff, ...Array.from({ length: extraSlots }, () => ({
    name: 'Extra',
    meetingPoint: meeting,
  }))]

  return {
    assignment: { responsible, drivers, staff },
    meta: { needsReview: violations.length > 0, violations, notes: [] },
  }
}

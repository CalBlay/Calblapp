// file: src/services/autoAssign.ts
import {
  loadDepartmentPersonnel,
  loadPremises,
  type DriverCrewPremise,
  type DepartmentPersonnelRef,
} from './premises'
import { buildLedger } from './workloadLedger'
import { isEligibleByName } from './eligibility'
import { calculatePersonalNeeded } from '@/utils/calculatePersonalNeeded'
import { assignVehiclesAndDrivers } from './vehicleAssign'


export interface Personnel {
  id: string
  name: string
  role: string
  department?: string
  isDriver?: boolean
  isJamonero?: boolean
  isResponsible?: boolean
  camioPetit?: boolean
  camioGran?: boolean
  available?: boolean
  maxHoursWeek?: number
  lastAssignedAt?: string | null
  weekAssigns?: number
  weekHrs?: number
  monthHrs?: number
}

interface RankedPersonnel {
  p: Personnel
  weekAssigns: number
  weekHrs: number
  monthHrs: number
  lastAssignedAt: string | null
}

type VehicleType = 'camioPetit' | 'camioGran' | 'furgoneta' | string

interface VehicleRequest {
  id?: string
  plate?: string
  vehicleType?: VehicleType
  type?: VehicleType
  conductorId?: string | null
}

interface ServiceJamoneroAssignment {
  id?: string
  mode?: 'auto' | 'manual'
  personnelId?: string | null
  personnelName?: string | null
}

interface PremiseCondition {
  locations: string[]
  responsibleId?: string
  responsible: string
}

interface PremisesConfig {
  conditions?: PremiseCondition[]
  driverCrews?: DriverCrewPremise[]
  restHours: number
  allowMultipleEventsSameDay?: boolean
  requireResponsible?: boolean
}

interface Ledger {
  assignmentsCountByUser: Map<string, number>
  weeklyHoursByUser: Map<string, number>
  monthlyHoursByUser: Map<string, number>
  lastAssignedAtByUser: Map<string, string | null>
  busyAssignments: Array<{ startISO: string; endISO: string; name: string }>
}

const RESPONSABLE_ROLES = new Set(['responsable', 'cap departament', 'supervisor'])
const EQUIP_ROLES = new Set([
  'equip',
  'tecnic', // fallback for other synonyms
  'treballador',
  'treballadora',
  'operari',
  'operaria',
  'auxiliar',
  'cuina',
  'cocinera',
  'chef',
])

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string | null) => unaccent((s || '').toLowerCase().trim())
const normRole = (s?: string | null) => {
  const raw = norm(s)
  return raw === 'soldat' ? 'equip' : raw
}

const isResponsiblePerson = (person?: Personnel | null) =>
  !!person && (person.isResponsible === true || RESPONSABLE_ROLES.has(normRole(person.role)))

const findBestNameMatch = (pool: Personnel[], rawName?: string | null) => {
  const target = norm(rawName)
  if (!target) return null

  const exact = pool.find((person) => norm(person.name) === target)
  if (exact) return exact

  const startsWith = pool.filter((person) => norm(person.name).startsWith(target))
  if (startsWith.length === 1) return startsWith[0]

  const contains = pool.filter((person) => norm(person.name).includes(target))
  if (contains.length === 1) return contains[0]

  return null
}

/**
 * Comparador per ordenar candidats segons càrrega de feina.
 */
function tieBreakOrder(a: RankedPersonnel, b: RankedPersonnel) {
  if (a.weekAssigns !== b.weekAssigns) return a.weekAssigns - b.weekAssigns
  if (a.weekHrs !== b.weekHrs) return a.weekHrs - b.weekHrs
  if (a.monthHrs !== b.monthHrs) return a.monthHrs - b.monthHrs
  const da = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0
  const db = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0
  return da - db
}

const buildEligibilityCtx = (premises: PremisesConfig, dept: string, busyAssignments: any[]) => ({
  busyAssignments,
  restHours: premises.restHours,
  allowMultipleEventsSameDay:
    dept === 'cuina' ? false : !!premises.allowMultipleEventsSameDay,
})

const getEligibility = (
  name: string,
  startISO: string,
  endISO: string,
  ctx: ReturnType<typeof buildEligibilityCtx>
) => isEligibleByName(name, startISO, endISO, ctx)

export async function autoAssign(payload: {
  department: string
  eventId: string
  // eventName: string  // ← si el vols usar, descomenta i fes-lo servir (ara no s’usa)
  location?: string
  meetingPoint?: string
  startDate: string
  startTime?: string
  endDate: string
  endTime?: string
  totalWorkers: number
  numDrivers: number
  manualResponsibleId?: string | null
  manualDriverId?: string | null
  jamoneroCount?: number
  serviceJamoneroAssignments?: ServiceJamoneroAssignment[]
  skipResponsible?: boolean
  vehicles?: VehicleRequest[]
  blockedNames?: string[]
  preferredResponsibleName?: string | null
  preferredDriverNames?: string[]
  preferredStaffNames?: string[]
  departmentPeople?: DepartmentPersonnelRef[]
  premises?: PremisesConfig
  premisesWarnings?: string[]
  ledger?: Ledger
}) {
  const {
    department, eventId, location,
    meetingPoint = '',
    startDate, startTime = '00:00',
    endDate, endTime = '00:00',
    totalWorkers, numDrivers,
    manualResponsibleId,
    manualDriverId,
    jamoneroCount = 0,
    serviceJamoneroAssignments = [],
    skipResponsible = false,
    vehicles = [],
    blockedNames = [],
    preferredResponsibleName = null,
    preferredDriverNames = [],
    preferredStaffNames = [],
    departmentPeople: preloadedDepartmentPeople,
    premises: preloadedPremises,
    premisesWarnings: preloadedPremisesWarnings = [],
    ledger: preloadedLedger,
  } = payload

  const startISO = `${startDate}T${startTime}:00`
  const endISO = `${endDate}T${endTime}:00`
  const dept: string = norm(department)
  const isCuina = dept === 'cuina'


  console.log('[autoAssign] ▶️ inici', {
    dept, eventId, dates: { startISO, endISO },
    totalWorkers, numDrivers,
    vehiclesRequested: vehicles.map(v => ({
      vehicleType: v.vehicleType ?? v.type,
      plate: v.plate,
      conductorId: v.conductorId
    }))
  })

  // 1) Premisses
  const departmentPeople = preloadedDepartmentPeople || (await loadDepartmentPersonnel(dept))

  const premisesResult = preloadedPremises
    ? { premises: preloadedPremises, warnings: preloadedPremisesWarnings }
    : ((await loadPremises(dept, departmentPeople)) as {
        premises: PremisesConfig
        warnings?: string[]
      })
  const { premises, warnings } = premisesResult

  // 2) Rang setmana / mes
  const d = new Date(startISO)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const weekStart = new Date(d); weekStart.setDate(d.getDate() - (day - 1))
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const [ws, we, ms, me] = [weekStart, weekEnd, monthStart, monthEnd].map(x => x.toISOString().slice(0, 10))

  // 3) Ledger
  // 3️⃣ Ledger
  const ledger = preloadedLedger || ((await buildLedger(dept, ws, we, ms, me, {
    includeAllDepartmentsForBusy: true,
  })) as any)




  // 4) Personal del departament
  const all: Personnel[] = departmentPeople.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    department: person.department,
    isDriver: person.isDriver,
    isJamonero: person.isJamonero,
    isResponsible: (person as any).isResponsible === true,
    camioPetit: person.camioPetit,
    camioGran: person.camioGran,
    available: person.available,
  })) as Personnel[]

  const normalizedJamoneroAssignments =
    Array.isArray(serviceJamoneroAssignments) && serviceJamoneroAssignments.length > 0
      ? serviceJamoneroAssignments.map((assignment, index) => ({
          id: String(assignment?.id || `jamonero-${index + 1}`),
          mode: assignment?.mode === 'manual' ? 'manual' as const : 'auto' as const,
          personnelId: assignment?.personnelId ? String(assignment.personnelId) : null,
          personnelName: assignment?.personnelName ? String(assignment.personnelName) : null,
        }))
      : Array.from({ length: Math.max(0, Number(jamoneroCount || 0)) }, (_, index) => ({
          id: `jamonero-${index + 1}`,
          mode: 'auto' as const,
          personnelId: null,
          personnelName: null,
        }))

  const shouldTrackJamoneros = normalizedJamoneroAssignments.length > 0

  const manualJamoneroIds = new Set(
    normalizedJamoneroAssignments
      .filter((assignment) => assignment.mode === 'manual' && assignment.personnelId)
      .map((assignment) => String(assignment.personnelId))
  )
  const manualJamoneroNames = new Set(
    normalizedJamoneroAssignments
      .filter((assignment) => assignment.mode === 'manual' && assignment.personnelName)
      .map((assignment) => norm(assignment.personnelName))
  )
  const isBlockedAsResponsible = (person: Personnel | null) => {
    if (!person) return false
    if (manualJamoneroIds.has(person.id)) return true
    return manualJamoneroNames.has(norm(person.name))
  }

  const isDeptHead = (p: Personnel) => {
    const r = normRole(p.role)
    return r === 'cap departament' || r === 'capdepartament'
  }

  // 5) Responsable (a cuina el gestionem per grups)
  let forcedByPremise = false
  let usedGeneralResponsibleFallback = false
  let chosenResp: Personnel | null = null
  let preferredResponsibleApplied = false
  let locationResponsibleConflict = false
  let locationResponsibleMatched = false
  let locationResponsibleName: string | null = null

  const baseCtx = buildEligibilityCtx(premises, dept, ledger.busyAssignments)

  if (!skipResponsible && manualResponsibleId) {
    chosenResp = all.find(p => p.id === manualResponsibleId) || null
  }

  if (!skipResponsible && !chosenResp && preferredResponsibleName) {
    const preferredResponsible = findBestNameMatch(
      all.filter((person) => isResponsiblePerson(person) || person.isDriver),
      preferredResponsibleName
    )
    if (preferredResponsible && !isBlockedAsResponsible(preferredResponsible)) {
      const elig = getEligibility(preferredResponsible.name, startISO, endISO, baseCtx)
      if (elig.eligible) {
        chosenResp = preferredResponsible
        preferredResponsibleApplied = true
      }
    }
  }

  if (!isCuina && !skipResponsible) {
    const locationCandidates = [location, meetingPoint]
      .map((value) => String(value || '').trim())
      .filter(Boolean)

    if (!chosenResp && premises.conditions?.length && locationCandidates.length > 0) {
      const hit = premises.conditions.find((c: PremiseCondition) =>
        c.locations.some((loc: string) => {
          const normalizedLoc = norm(loc)
          return locationCandidates.some((candidate) =>
            norm(candidate).includes(normalizedLoc)
          )
        })
      )
      if (hit) {
        locationResponsibleMatched = true
        locationResponsibleName = hit.responsible
        const candidate =
          (hit.responsibleId
            ? all.find((person) => person.id === hit.responsibleId) || null
            : null) || findBestNameMatch(all, hit.responsible)
        if (candidate && !isBlockedAsResponsible(candidate)) {
          const elig = getEligibility(candidate.name, startISO, endISO, baseCtx)
          if (!elig.eligible) {
            forcedByPremise = true
            locationResponsibleConflict = true
          }
          chosenResp = candidate
        }
      }
    }
    if (!chosenResp) {
      const pool = all.filter(
        p =>
          isResponsiblePerson(p) &&
          (p.available !== false) &&
          !isDeptHead(p) &&
          !isBlockedAsResponsible(p)
      )
      const ranked = pool
        .map(p => ({
          p,
          weekAssigns: ledger.assignmentsCountByUser.get(p.name) || 0,
          weekHrs: ledger.weeklyHoursByUser.get(p.name) || 0,
          monthHrs: ledger.monthlyHoursByUser.get(p.name) || 0,
          lastAssignedAt: ledger.lastAssignedAtByUser.get(p.name) || null
        }))
        .sort(tieBreakOrder)
      const eligibleCtx = {
        busyAssignments: ledger.busyAssignments,
        restHours: premises.restHours,
        allowMultipleEventsSameDay: false,
      }
      const eligible = ranked.find((entry) =>
        isEligibleByName(entry.p.name, startISO, endISO, eligibleCtx).eligible
      )
      chosenResp = eligible?.p || null
    }
    if (!chosenResp && dept === 'serveis') {
      const fallbackPool = all
        .filter((p) => p.available !== false && !isDeptHead(p) && !isBlockedAsResponsible(p))
        .map((p) => ({
          p,
          weekAssigns: ledger.assignmentsCountByUser.get(p.name) || 0,
          weekHrs: ledger.weeklyHoursByUser.get(p.name) || 0,
          monthHrs: ledger.monthlyHoursByUser.get(p.name) || 0,
          lastAssignedAt: ledger.lastAssignedAtByUser.get(p.name) || null,
        }))
        .sort(tieBreakOrder)
      const fallback = fallbackPool.find((entry) =>
        isEligibleByName(entry.p.name, startISO, endISO, {
          busyAssignments: ledger.busyAssignments,
          restHours: premises.restHours,
          allowMultipleEventsSameDay: false,
        }).eligible
      )
      chosenResp = fallback?.p || null
      if (chosenResp) usedGeneralResponsibleFallback = true
    }
  }

  const notes: string[] = [...(warnings || [])]
  const violations: string[] = []
  if (usedGeneralResponsibleFallback) {
    notes.push('Responsable autoassignat amb fallback general (sense rol de responsable disponible)')
  }
  if (locationResponsibleMatched && !chosenResp) {
    violations.push('location_responsible_missing')
    notes.push(
      `La premissa d'ubicacio apunta a ${locationResponsibleName || 'un responsable'} pero no s'ha trobat al departament.`
    )
  }
  if (!isCuina && !skipResponsible && !chosenResp) {
    if (premises.requireResponsible) violations.push('responsible_missing')
    notes.push('No hi ha responsable elegible (ocupat o descans insuficient)')
  }
  if (forcedByPremise && chosenResp) {
    violations.push('premise_override')
    notes.push('Responsable assignat per premissa tot i no complir elegibilitat')
  }
  if (locationResponsibleConflict && chosenResp) {
    violations.push('location_responsible_conflict')
    notes.push(
      `El responsable fix per ubicacio (${chosenResp.name}) te conflicte de disponibilitat. Cal revisar quin dels dos quadrants s'ha de modificar.`
    )
  }

  const resolveJamoneroPerson = (assignment: {
    personnelId?: string | null
    personnelName?: string | null
  }) => {
    if (assignment.personnelId) {
      const byId = all.find((person) => person.id === assignment.personnelId) || null
      if (byId) return byId
    }
    if (assignment.personnelName) {
      return findBestNameMatch(all, assignment.personnelName)
    }
    return null
  }

  const requestedManualJamoneros = normalizedJamoneroAssignments
    .filter((assignment) => assignment.mode === 'manual')
    .map((assignment) => ({
      assignment,
      person: resolveJamoneroPerson(assignment),
    }))
    .filter(
      (entry): entry is { assignment: (typeof normalizedJamoneroAssignments)[number]; person: Personnel } =>
        Boolean(entry.person)
    )

  // 6) Pools de conductors i staff
  const blockedNormNames = new Set(
    Array.isArray(blockedNames)
      ? blockedNames
          .map((name) => norm(name))
          .filter(Boolean)
      : []
  )
  const exclude = new Set<string>(chosenResp ? [norm(chosenResp.name)] : [])
  blockedNormNames.forEach((name) => exclude.add(name))

  const rank = (p: Personnel): RankedPersonnel => ({
    p,
    weekAssigns: ledger.assignmentsCountByUser.get(p.name) || 0,
    weekHrs: ledger.weeklyHoursByUser.get(p.name) || 0,
    monthHrs: ledger.monthlyHoursByUser.get(p.name) || 0,
    lastAssignedAt: ledger.lastAssignedAtByUser.get(p.name) || null
  })

  const respNorm = chosenResp ? norm(chosenResp.name) : null
  const driverPool = all
    .filter(
      (p) =>
        p.isDriver &&
        p.available !== false &&
        !isDeptHead(p) &&
        (respNorm && norm(p.name) === respNorm
          ? true
          : !exclude.has(norm(p.name)))
    )
    .filter(p => isEligibleByName(p.name, startISO, endISO, baseCtx).eligible)
    .map(rank)
    .sort(tieBreakOrder)

  const workerCandidates = all
    .filter((p) => p.available !== false && !exclude.has(norm(p.name)) && !isDeptHead(p))
    .map(rank)
    .filter((candidate) =>
      isEligibleByName(candidate.p.name, startISO, endISO, baseCtx).eligible
    )
    .sort(tieBreakOrder)

  const isEquipRole = (candidate: RankedPersonnel) =>
    EQUIP_ROLES.has(normRole(candidate.p.role))
  const isResponsableRole = (candidate: RankedPersonnel) => isResponsiblePerson(candidate.p)
  const isDriverRole = (candidate: RankedPersonnel) => !!candidate.p.isDriver

  const staffPool = [
    ...workerCandidates.filter(isEquipRole),
    ...workerCandidates.filter(isResponsableRole),
    ...workerCandidates.filter((candidate) => !isEquipRole(candidate) && !isResponsableRole(candidate) && isDriverRole(candidate)),
    ...workerCandidates.filter((candidate) => !isEquipRole(candidate) && !isResponsableRole(candidate) && !isDriverRole(candidate)),
  ]

  const preferredDrivers: Array<{ name: string; meetingPoint: string; plate: string; vehicleType: string }> = []
  const preferredStaff: Array<{ name: string; meetingPoint: string }> = []
  const reservedNames = new Set<string>(exclude)

  preferredDriverNames
    .map((name) => findBestNameMatch(all.filter((person) => person.isDriver), name))
    .filter((person): person is Personnel => Boolean(person))
    .forEach((person) => {
      const personNorm = norm(person.name)
      if (reservedNames.has(personNorm)) return
      if (!getEligibility(person.name, startISO, endISO, baseCtx).eligible) return
      preferredDrivers.push({
        name: person.name,
        meetingPoint,
        plate: '',
        vehicleType: '',
      })
      reservedNames.add(personNorm)
    })

  preferredStaffNames
    .map((name) => findBestNameMatch(all, name))
    .filter((person): person is Personnel => Boolean(person))
    .forEach((person) => {
      const personNorm = norm(person.name)
      if (reservedNames.has(personNorm)) return
      if (!getEligibility(person.name, startISO, endISO, baseCtx).eligible) return
      preferredStaff.push({ name: person.name, meetingPoint })
      reservedNames.add(personNorm)
    })

  const findPersonnelByCrewRef = (ref: { id?: string; name?: string }) =>
    all.find((person) => {
      if (ref.id && person.id === ref.id) return true
      if (ref.name && norm(person.name) === norm(ref.name)) return true
      return false
    }) || null

  const findCrewByDriver = (driver: { id?: string | null; name?: string | null }) =>
    Array.isArray(premises.driverCrews)
      ? premises.driverCrews.find((crew) => {
          const candidate = findPersonnelByCrewRef({
            id: crew.driverId,
            name: crew.driverName,
          })
          if (!candidate) return false
          if (driver.id && candidate.id === driver.id) return true
          if (driver.name && norm(candidate.name) === norm(driver.name)) return true
          return false
        }) || null
      : null

  const findCrewByCompanion = (person: Personnel | null) =>
    person && Array.isArray(premises.driverCrews)
      ? premises.driverCrews.find((crew) =>
          crew.companions.some((companion) => {
            const candidate = findPersonnelByCrewRef(companion)
            return !!candidate && norm(candidate.name) === norm(person.name)
          })
        ) || null
      : null

  const appendCrewCompanions = (crew?: DriverCrewPremise | null) => {
    if (!crew) return
    const orderedCompanions = [...crew.companions]
      .map((companion, index) => ({ companion, index }))
      .sort((a, b) => {
        const aPerson = findPersonnelByCrewRef(a.companion)
        const bPerson = findPersonnelByCrewRef(b.companion)
        const aIsJamonero = aPerson?.isJamonero === true ? 1 : 0
        const bIsJamonero = bPerson?.isJamonero === true ? 1 : 0
        if (aIsJamonero !== bIsJamonero) return bIsJamonero - aIsJamonero
        return a.index - b.index
      })

    orderedCompanions.forEach(({ companion, index }) => {
      const person = findPersonnelByCrewRef(companion)
      if (!person) {
        violations.push('driver_companion_missing')
        notes.push(
          `L'acompanyant ${index + 1} de l'equip habitual del conductor no existeix al departament.`
        )
        return
      }

      const personNorm = norm(person.name)
      if (reservedNames.has(personNorm)) return

      const elig = getEligibility(person.name, startISO, endISO, baseCtx)
      if (!elig.eligible) {
        violations.push('driver_companion_conflict')
        notes.push(
          `L'acompanyant ${person.name} de l'equip habitual del conductor no esta disponible.`
        )
        return
      }

      preferredStaff.push({ name: person.name, meetingPoint })
      reservedNames.add(personNorm)
    })
  }

  if (manualDriverId && vehicles.length === 0) {
    const manualDriver = all.find((person) => person.id === manualDriverId) || null
    if (!manualDriver || !manualDriver.isDriver) {
      violations.push('manual_driver_missing')
      notes.push("El conductor seleccionat manualment no existeix o no te perfil de conductor.")
    } else {
      const driverEligibility = getEligibility(manualDriver.name, startISO, endISO, baseCtx)
      if (!driverEligibility.eligible) {
        violations.push('manual_driver_conflict')
        notes.push(
          `El conductor seleccionat manualment (${manualDriver.name}) te conflicte de disponibilitat.`
        )
      }
      preferredDrivers.push({
        name: manualDriver.name,
        meetingPoint,
        plate: '',
        vehicleType: '',
      })
      reservedNames.add(norm(manualDriver.name))

      const manualCrew =
        dept === 'serveis' && Array.isArray(premises.driverCrews)
          ? premises.driverCrews.find((crew) => {
              const candidate = findPersonnelByCrewRef({
                id: crew.driverId,
                name: crew.driverName,
              })
              return !!candidate && norm(candidate.name) === norm(manualDriver.name)
            })
          : null

      appendCrewCompanions(manualCrew)
    }
  }

  if (
    vehicles.length === 0 &&
    !manualDriverId &&
    preferredDrivers.length === 0 &&
    chosenResp?.isDriver &&
    Number(numDrivers || 0) > 0
  ) {
    const chosenRespName = chosenResp.name
    preferredDrivers.push({
      name: chosenRespName,
      meetingPoint,
      plate: '',
      vehicleType: '',
    })
    reservedNames.add(norm(chosenRespName))

    const respCrew =
      dept === 'serveis' && Array.isArray(premises.driverCrews)
        ? premises.driverCrews.find((crew) => {
            const candidate = findPersonnelByCrewRef({
              id: crew.driverId,
              name: crew.driverName,
            })
            return !!candidate && norm(candidate.name) === norm(chosenRespName)
          })
        : null

    appendCrewCompanions(respCrew)
  }

  if (
    vehicles.length === 0 &&
    !manualDriverId &&
    preferredDrivers.length === 0 &&
    dept === 'serveis' &&
    chosenResp &&
    !chosenResp.isDriver &&
    Number(numDrivers || 0) > 0 &&
    Array.isArray(premises.driverCrews)
  ) {
    const responsibleCrew = premises.driverCrews.find((crew) => {
      const companionHit = crew.companions.some((companion) => {
        const candidate = findPersonnelByCrewRef(companion)
        return !!candidate && norm(candidate.name) === norm(chosenResp?.name)
      })
      if (!companionHit) return false
      const driverCandidate = findPersonnelByCrewRef({
        id: crew.driverId,
        name: crew.driverName,
      })
      if (!driverCandidate || !driverCandidate.isDriver) return false
      if (reservedNames.has(norm(driverCandidate.name))) return false
      return getEligibility(driverCandidate.name, startISO, endISO, baseCtx).eligible
    })

    if (responsibleCrew) {
      const crewDriver = findPersonnelByCrewRef({
        id: responsibleCrew.driverId,
        name: responsibleCrew.driverName,
      })
      if (crewDriver && crewDriver.isDriver) {
        preferredDrivers.push({
          name: crewDriver.name,
          meetingPoint,
          plate: '',
          vehicleType: '',
        })
        reservedNames.add(norm(crewDriver.name))
        appendCrewCompanions(responsibleCrew)
      }
    }
  }

  if (
    vehicles.length === 0 &&
    !manualDriverId &&
    preferredDrivers.length === 0 &&
    dept === 'serveis' &&
    Number(numDrivers || 0) > 0
  ) {
    const preferredManualJamoneroCrewDriver = requestedManualJamoneros.find(({ person }) => {
      if (person.isDriver) return false
      if (chosenResp && norm(person.name) === norm(chosenResp.name)) return false
      const crew = findCrewByCompanion(person)
      if (!crew) return false
      const driverCandidate = findPersonnelByCrewRef({
        id: crew.driverId,
        name: crew.driverName,
      })
      if (!driverCandidate || !driverCandidate.isDriver) return false
      if (reservedNames.has(norm(driverCandidate.name))) return false
      return getEligibility(driverCandidate.name, startISO, endISO, baseCtx).eligible
    })

    if (preferredManualJamoneroCrewDriver) {
      const crew = findCrewByCompanion(preferredManualJamoneroCrewDriver.person)
      const driverCandidate = crew
        ? findPersonnelByCrewRef({
            id: crew.driverId,
            name: crew.driverName,
          })
        : null

      if (driverCandidate && driverCandidate.isDriver) {
        preferredDrivers.push({
          name: driverCandidate.name,
          meetingPoint,
          plate: '',
          vehicleType: '',
        })
        reservedNames.add(norm(driverCandidate.name))
        appendCrewCompanions(crew)
      }
    }
  }

  if (
    vehicles.length === 0 &&
    !manualDriverId &&
    preferredDrivers.length === 0 &&
    dept === 'serveis' &&
    Number(numDrivers || 0) > 0
  ) {
    const preferredManualJamoneroDriver = requestedManualJamoneros.find(({ person }) => {
      if (!person.isDriver) return false
      if (chosenResp && norm(person.name) === norm(chosenResp.name)) return false
      if (reservedNames.has(norm(person.name))) return false
      return getEligibility(person.name, startISO, endISO, baseCtx).eligible
    })?.person

    const preferredAutoJamoneroDriver =
      preferredManualJamoneroDriver
        ? null
        : driverPool.find(
            (candidate) =>
              candidate.p.isJamonero === true &&
              !reservedNames.has(norm(candidate.p.name))
          )?.p || null

    const jamoneroDriver = preferredManualJamoneroDriver || preferredAutoJamoneroDriver

    if (jamoneroDriver) {
      preferredDrivers.push({
        name: jamoneroDriver.name,
        meetingPoint,
        plate: '',
        vehicleType: '',
      })
      reservedNames.add(norm(jamoneroDriver.name))

      const jamoneroCrew =
        Array.isArray(premises.driverCrews)
          ? premises.driverCrews.find((crew) => {
              const candidate = findPersonnelByCrewRef({
                id: crew.driverId,
                name: crew.driverName,
              })
              return !!candidate && norm(candidate.name) === norm(jamoneroDriver.name)
            })
          : null

      appendCrewCompanions(jamoneroCrew)
    }
  }

  if (
    vehicles.length === 0 &&
    !manualDriverId &&
    preferredDrivers.length === 0 &&
    dept === 'serveis' &&
    Number(numDrivers || 0) > 0 &&
    Array.isArray(premises.driverCrews)
  ) {
    const preferredCrew = premises.driverCrews.find((crew) => {
      const candidate = findPersonnelByCrewRef({
        id: crew.driverId,
        name: crew.driverName,
      })
      if (!candidate || !candidate.isDriver) return false
      if (reservedNames.has(norm(candidate.name))) return false
      return getEligibility(candidate.name, startISO, endISO, baseCtx).eligible
    })

    if (preferredCrew) {
      const preferredDriver = findPersonnelByCrewRef({
        id: preferredCrew.driverId,
        name: preferredCrew.driverName,
      })

      if (preferredDriver && preferredDriver.isDriver) {
        preferredDrivers.push({
          name: preferredDriver.name,
          meetingPoint,
          plate: '',
          vehicleType: '',
        })
        reservedNames.add(norm(preferredDriver.name))
      }

      appendCrewCompanions(preferredCrew)
    } else if (premises.driverCrews.length > 0) {
      violations.push('driver_crew_conflict')
      notes.push(
        'Cap conductor dels equips habituals esta disponible respectant l ordre definit dels acompanyants.'
      )
    }
  }

  // 6.1) Assignació de conductors + vehicles
  const remainingDriversNeeded = Math.max(
    Number(numDrivers || 0) - preferredDrivers.length,
    0
  )
  const driverRequests =
    vehicles.length === 0 && remainingDriversNeeded > 0
      ? Array.from({ length: remainingDriversNeeded }, () => ({}))
      : vehicles

  const driversFallback =
    remainingDriversNeeded > 0 || vehicles.length > 0
      ? await assignVehiclesAndDrivers({
          meetingPoint,
          startISO,
          endISO,
          baseCtx,
          driverPool: driverPool.filter(
            (candidate) => !reservedNames.has(norm(candidate.p.name))
          ),
          vehiclesRequested: driverRequests,
        })
      : []

  const drivers = [...preferredDrivers, ...driversFallback].map((driver) => {
    const matched = all.find((person) => norm(person.name) === norm(driver.name))
    return {
      ...driver,
      isJamonero: shouldTrackJamoneros && matched?.isJamonero === true,
    }
  })

  if (
    dept === 'serveis' &&
    !skipResponsible &&
    !manualResponsibleId &&
    !preferredResponsibleApplied
  ) {
    const primaryDriver = drivers.find((driver) => driver.name && driver.name !== 'Extra')
    const matchedResponsibleDriver = primaryDriver
      ? all.find((person) => {
          if (norm(person.name) !== norm(primaryDriver.name)) return false
          return isResponsiblePerson(person)
        }) || null
      : null

    if (matchedResponsibleDriver) {
      chosenResp = matchedResponsibleDriver
    }
  }

  const isJamoneroPerson = (name?: string | null) => {
    const matched = all.find((person) => norm(person.name) === norm(name))
    return matched?.isJamonero === true
  }

  // 6.2) Càlcul de treballadors reals
  const driversForCalc = drivers.filter((d) => d.name !== 'Extra').map((d) => ({
    name: d.name,
  }))
  const totalRequestedWorkers = Number(totalWorkers) || 0
  const neededWorkers = calculatePersonalNeeded({
    staffCount: Number(totalWorkers) || 0,
    drivers: driversForCalc,
    responsableName: chosenResp?.name || null,
    requestedDrivers: Number.isFinite(numDrivers) ? numDrivers : 0
  })

  const uniqueAssignedNames = new Set<string>()
  if (chosenResp?.name) uniqueAssignedNames.add(chosenResp.name)
  driversForCalc.forEach((d) => uniqueAssignedNames.add(d.name))
  const missingToReachTotal = Math.max(totalRequestedWorkers - uniqueAssignedNames.size, 0)
  const finalNeededWorkers = Math.max(neededWorkers, missingToReachTotal)

  // 6.3) Selecció de treballadors
  const selectedPreferredStaff = preferredStaff.slice(0, finalNeededWorkers)
  const staff: Array<{ name: string; meetingPoint: string; isJamonero?: boolean }> = [
    ...selectedPreferredStaff.map((member) => ({
      ...member,
      isJamonero: shouldTrackJamoneros && isJamoneroPerson(member.name),
    })),
  ]
  const taken = new Set<string>(exclude)
  if (chosenResp?.name) taken.add(norm(chosenResp.name))
  driversForCalc.forEach((d) => taken.add(norm(d.name)))
  selectedPreferredStaff.forEach((member) => taken.add(norm(member.name)))

  const satisfyJamoneroFromExisting = (personName?: string | null) => {
    const normalizedName = norm(personName)
    if (!normalizedName || (chosenResp?.name && normalizedName === norm(chosenResp.name))) return false
    if (!isJamoneroPerson(personName)) return false
    return true
  }

  let satisfiedManualJamoneros = 0
  const unresolvedManualJamoneros = requestedManualJamoneros.filter(({ person }) => {
    const matchedExisting =
      driversForCalc.some((driver) => norm(driver.name) === norm(person.name)) ||
      staff.some((member) => norm(member.name) === norm(person.name))
    if (matchedExisting && satisfyJamoneroFromExisting(person.name)) {
      satisfiedManualJamoneros += 1
      return false
    }
    if (chosenResp?.name && norm(person.name) === norm(chosenResp.name)) {
      notes.push(`El jamonero ${person.name} no pot coincidir amb el responsable.`)
      return true
    }
    return true
  })

  unresolvedManualJamoneros.forEach(({ person }) => {
    const personNorm = norm(person.name)
    const currentDriverCrews = driversForCalc
      .map((driver) => findCrewByDriver({ name: driver.name }))
      .filter((crew): crew is DriverCrewPremise => Boolean(crew))
    const belongsToCurrentCrew =
      currentDriverCrews.length === 0 ||
      currentDriverCrews.some((crew) =>
        crew.companions.some((companion) => {
          const candidate = findPersonnelByCrewRef(companion)
          return !!candidate && norm(candidate.name) === personNorm
        })
      ) ||
      driversForCalc.some((driver) => person.isDriver && norm(driver.name) === personNorm)

    if (taken.has(personNorm)) return
    if (!getEligibility(person.name, startISO, endISO, baseCtx).eligible) return

    if (staff.length < finalNeededWorkers) {
      staff.push({ name: person.name, meetingPoint, isJamonero: true })
      taken.add(personNorm)
      satisfiedManualJamoneros += 1
      return
    }

    const replaceIdx = staff.findIndex((member) => {
      if (member.isJamonero === true) return false
      if (belongsToCurrentCrew) return true
      return true
    })
    if (replaceIdx >= 0) {
      taken.delete(norm(staff[replaceIdx]?.name))
      staff[replaceIdx] = { name: person.name, meetingPoint, isJamonero: true }
      taken.add(personNorm)
      satisfiedManualJamoneros += 1
    }
  })

  const assignedJamoneroDrivers = driversForCalc.filter((driver) => {
    return isJamoneroPerson(driver.name) && norm(driver.name) !== norm(chosenResp?.name)
  }).length
  const assignedJamoneroStaff = staff.filter((member) => member.isJamonero === true).length
  const totalRequestedJamoneros = normalizedJamoneroAssignments.length
  const coveredJamoneros = Math.max(
    assignedJamoneroDrivers + assignedJamoneroStaff,
    satisfiedManualJamoneros
  )
  const remainingJamonerosNeeded = Math.max(totalRequestedJamoneros - coveredJamoneros, 0)
  if (remainingJamonerosNeeded > 0) {
    const jamoneroCandidates = staffPool.filter(
      (candidate) =>
        candidate.p.isJamonero === true &&
        !taken.has(norm(candidate.p.name)) &&
        (!chosenResp || norm(candidate.p.name) !== norm(chosenResp.name))
    )

    const selectedJamoneros = jamoneroCandidates.slice(0, remainingJamonerosNeeded)
    selectedJamoneros.forEach((candidate) => {
      if (staff.length < finalNeededWorkers) {
        staff.push({ name: candidate.p.name, meetingPoint, isJamonero: true })
      } else {
        let replaceIdx = staff.findIndex((member) => member.isJamonero !== true)
        if (replaceIdx < 0) {
          replaceIdx = staff.findIndex(
            (member) => !selectedPreferredStaff.some((pref) => norm(pref.name) === norm(member.name))
          )
        }
        if (replaceIdx >= 0) {
          taken.delete(norm(staff[replaceIdx]?.name))
          staff[replaceIdx] = { name: candidate.p.name, meetingPoint, isJamonero: true }
        }
      }
      taken.add(norm(candidate.p.name))
    })

    if (selectedJamoneros.length < remainingJamonerosNeeded) {
      violations.push('jamonero_shortage')
      notes.push(
        `No hi ha prou talladors de pernil disponibles (${selectedJamoneros.length}/${remainingJamonerosNeeded}).`
      )
    }
  }

  for (const cand of staffPool) {
    if (staff.length >= finalNeededWorkers) break
    const nm = norm(cand.p.name)
    if (taken.has(nm)) continue
    staff.push({
      name: cand.p.name,
      meetingPoint,
      isJamonero: shouldTrackJamoneros && cand.p.isJamonero === true,
    })
    taken.add(nm)
  }
  while (staff.length < finalNeededWorkers) {
    staff.push({ name: 'Extra', meetingPoint, isJamonero: false })
  }

  const needsReview = violations.length > 0

  console.log('[autoAssign] ✅ resultat', {
    responsible: chosenResp?.name || null,
    drivers: drivers.map(d => ({ name: d.name, plate: d.plate, vehicleType: d.vehicleType })),
    staffCount: staff.length,
    needsReview, violations, notes
  })

  return {
    assignment: {
      responsible: chosenResp ? { name: chosenResp.name } : null,
      drivers,
      staff
    },
    meta: { needsReview, violations, notes }
  }
}

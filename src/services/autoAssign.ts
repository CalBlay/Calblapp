// file: src/services/autoAssign.ts
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { loadPremises, type DriverCrewPremise } from './premises'
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

interface PremiseCondition {
  locations: string[]
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
  skipResponsible?: boolean
  vehicles?: VehicleRequest[]
}) {
  const {
    department, eventId, location,
    meetingPoint = '',
    startDate, startTime = '00:00',
    endDate, endTime = '00:00',
    totalWorkers, numDrivers,
    manualResponsibleId,
    skipResponsible = false,
    vehicles = []
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
  const { premises, warnings } = (await loadPremises(dept)) as {
    premises: PremisesConfig
    warnings?: string[]
  }

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
  const ledger = (await buildLedger(dept, ws, we, ms, me, {
    includeAllDepartmentsForBusy: true,
  })) as any




  // 4) Personal del departament
  const ps = await db.collection('personnel').get()
  const all: Personnel[] = ps.docs
    .map(dref => ({ id: dref.id, ...(dref.data() as Record<string, unknown>) }))
    .filter(p => norm((p as Personnel).department) === dept) as Personnel[]

  const isDeptHead = (p: Personnel) => {
    const r = normRole(p.role)
    return r === 'cap departament' || r === 'capdepartament'
  }

  // 5) Responsable (a cuina el gestionem per grups)
  let forcedByPremise = false
  let usedGeneralResponsibleFallback = false
  let chosenResp: Personnel | null = null
  let locationResponsibleConflict = false
  let locationResponsibleMatched = false
  let locationResponsibleName: string | null = null

  const baseCtx = buildEligibilityCtx(premises, dept, ledger.busyAssignments)

  if (!isCuina && !skipResponsible) {
    if (manualResponsibleId) {
      chosenResp = all.find(p => p.id === manualResponsibleId) || null
    }
    if (!chosenResp && premises.conditions?.length && location) {
      const hit = premises.conditions.find((c: PremiseCondition) =>
        c.locations.some((loc: string) => norm(location).includes(norm(loc)))
      )
      if (hit) {
        locationResponsibleMatched = true
        locationResponsibleName = hit.responsible
        const candidate = all.find(p => norm(p.name) === norm(hit.responsible))
        if (candidate) {
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
        p => RESPONSABLE_ROLES.has(normRole(p.role)) && (p.available !== false) && !isDeptHead(p)
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
        .filter((p) => p.available !== false && !isDeptHead(p))
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

  // 6) Pools de conductors i staff
  const exclude = new Set<string>(chosenResp ? [norm(chosenResp.name)] : [])

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
  const isResponsableRole = (candidate: RankedPersonnel) =>
    RESPONSABLE_ROLES.has(normRole(candidate.p.role))
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

  const findPersonnelByCrewRef = (ref: { id?: string; name?: string }) =>
    all.find((person) => {
      if (ref.id && person.id === ref.id) return true
      if (ref.name && norm(person.name) === norm(ref.name)) return true
      return false
    }) || null

  if (dept === 'serveis' && Number(numDrivers || 0) > 0 && Array.isArray(premises.driverCrews)) {
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

      preferredCrew.companions.forEach((companion, index) => {
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

  const drivers = [...preferredDrivers, ...driversFallback]

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
  const staff: Array<{ name: string; meetingPoint: string }> = [...preferredStaff]
  const taken = new Set<string>(reservedNames)
  driversForCalc.forEach((d) => taken.add(norm(d.name)))

  for (const cand of staffPool) {
    if (staff.length >= finalNeededWorkers) break
    const nm = norm(cand.p.name)
    if (taken.has(nm)) continue
    staff.push({ name: cand.p.name, meetingPoint })
    taken.add(nm)
  }
  while (staff.length < finalNeededWorkers) {
    staff.push({ name: 'Extra', meetingPoint })
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

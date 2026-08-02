import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import type { NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { readLegacyExternalWorkersFromDoc } from '@/lib/legacyExternalWorkers'
import { canDriverHandleVehicleType } from '@/lib/driverCapabilities'
import { isResponsiblePerson } from '@/lib/personnelRoles'
import { normalizeTransportType } from '@/lib/transportTypes'
import { evaluateRangeEligibility } from '@/services/eligibility'
import {
  loadPersonnelRules,
  listQuadrantCollections,
  fetchQuadrantDocsByEndDate,
  QuadrantDoc,
} from '@/utils/personnelRest'

type AvailEntry = {
  id: string
  name: string
  role: string
  status: 'available' | 'conflict'
  reason: string
  isDriver?: boolean
  isJamonero?: boolean
  isResponsible?: boolean
  camioPetit?: boolean
  camioGran?: boolean
}

type PersonRef = {
  id?: string
  name?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
}

type OccupiedRange = {
  start: Date
  end: Date
  startDate: string
  source?: {
    collection?: string
    docId?: string
    eventId?: string
    status?: string
    role?: string
    personKey?: string
  }
}

type MaintenancePlannedDoc = {
  date?: string
  startTime?: string
  endTime?: string
  workerIds?: string[]
  workerNames?: string[]
}

type MaintenanceTicketDoc = {
  plannedStart?: number | string | null
  plannedEnd?: number | string | null
  assignedToIds?: string[]
  assignedToNames?: string[]
}

interface PersonnelDoc {
  name?: string
  role?: string
  department?: string
  isDriver?: boolean
  /** Alguns documents dupliquen flags a l’arrel. */
  camioPetit?: boolean
  camioGran?: boolean
  driver?: {
    isDriver?: boolean
    camioGran?: boolean
    camioPetit?: boolean
  }
  [key: string]: unknown
}

type QuadrantOccupancyDoc = QuadrantDoc & {
  eventId?: string
  status?: string
  confirmed?: boolean
  confirmada?: boolean
  confirmedAt?: unknown
}

const TREBALLADOR_ROLES = new Set(['equip', 'treballador', 'operari'])

const personIsResponsible = (data: { role?: string; isResponsible?: boolean }) =>
  isResponsiblePerson(data)

const unaccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
const norm = (v?: string | null) => unaccent(String(v ?? '').trim().toLowerCase())
const cleanAvailabilityList = (
  items: AvailEntry[],
  excludeIds: Set<string>,
  excludeNames: Set<string>
) =>
  items.filter((item) => {
    const id = norm(item.id)
    const name = norm(item.name)
    if (id && excludeIds.has(id)) return false
    if (name && excludeNames.has(name)) return false
    return true
  })

const shouldCountQuadrantOccupancy = (doc: QuadrantOccupancyDoc) => {
  const status = norm(doc.status)
  // Els quadrants confirmats i els esborranys actius han de bloquejar disponibilitat.
  // Només ignorem estats clarament cancel·lats.
  if (['cancelled', 'canceled', 'cancelat', 'cancelada', 'anullat', 'anulat'].includes(status)) {
    return false
  }
  return true
}

function uniqueById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of arr) {
    const nid = norm(item.id)
    if (!seen.has(nid)) {
      seen.add(nid)
      out.push(item)
    }
  }
  return out
}

const buildDate = (date?: string, time?: string) =>
  new Date(`${date || ''}T${time || '00:00'}:00`)

const normalizeRange = (start: Date, end: Date) =>
  end <= start ? { start, end: new Date(end.getTime() + 24 * 60 * 60 * 1000) } : { start, end }

const pushIndexedRange = (
  index: Map<string, OccupiedRange[]>,
  key: string | undefined,
  start: Date,
  end: Date,
  startDate: string,
  source?: OccupiedRange['source']
) => {
  const normalizedKey = norm(key)
  if (!normalizedKey) return
  const list = index.get(normalizedKey) || []
  list.push({ start, end, startDate, source })
  index.set(normalizedKey, list)
}

const addRangesFromRef = (
  index: Map<string, OccupiedRange[]>,
  ref: PersonRef | null,
  base: QuadrantDoc,
  source?: Omit<NonNullable<OccupiedRange['source']>, 'personKey' | 'role'> & { role?: string }
) => {
  if (!ref) return

  const rawStart = buildDate(ref.startDate || base.startDate, ref.startTime || base.startTime)
  const rawEnd = buildDate(ref.endDate || base.endDate || base.startDate, ref.endTime || base.endTime || base.startTime)
  if (isNaN(rawStart.getTime()) || isNaN(rawEnd.getTime())) return

  const range = normalizeRange(rawStart, rawEnd)
  const rangeStartDate = String(ref.startDate || base.startDate || '').trim()
  pushIndexedRange(index, ref.id, range.start, range.end, rangeStartDate, {
    ...source,
    personKey: norm(ref.id),
  })
  pushIndexedRange(index, ref.name, range.start, range.end, rangeStartDate, {
    ...source,
    personKey: norm(ref.name),
  })
}

const addMaintenanceRange = (
  index: Map<string, OccupiedRange[]>,
  start: Date,
  end: Date,
  startDate: string,
  ids?: string[],
  names?: string[],
  source?: Omit<NonNullable<OccupiedRange['source']>, 'personKey'>
) => {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return
  const range = normalizeRange(start, end)
  ;(ids || []).forEach((id) =>
    pushIndexedRange(index, id, range.start, range.end, startDate, {
      ...source,
      personKey: norm(id),
    })
  )
  ;(names || []).forEach((name) =>
    pushIndexedRange(index, name, range.start, range.end, startDate, {
      ...source,
      personKey: norm(name),
    })
  )
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const deptParam = searchParams.get('department')
  const sd = searchParams.get('startDate')
  const st = searchParams.get('startTime')
  const ed = searchParams.get('endDate')
  const et = searchParams.get('endTime')
  const excludeEventId = searchParams.get('excludeEventId')
  const excludeMaintenancePlannedId = searchParams.get('excludeMaintenancePlannedId')
  const excludeMaintenanceTicketId = searchParams.get('excludeMaintenanceTicketId')
  const excludeIds = new Set(searchParams.getAll('excludeId').map((value) => norm(value)).filter(Boolean))
  const excludeNames = new Set(
    searchParams.getAll('excludeName').map((value) => norm(value)).filter(Boolean)
  )
  const includeConflicts = ['1', 'true', 'yes'].includes(
    String(searchParams.get('includeConflicts') || '').toLowerCase()
  )
  const debugPerson = String(searchParams.get('debugPerson') || '').trim()
  const debugPersonNorm = norm(debugPerson)
  /** Si ve informat, només es llisten conductors aptes per aquest tipus (veure `canDriverHandleVehicleType`). */
  const vehicleTypeRaw = searchParams.get('vehicleType')?.trim()
  const vehicleTypeNorm = vehicleTypeRaw ? normalizeTransportType(vehicleTypeRaw) : ''

  if (!deptParam || !sd || !ed) {
    return NextResponse.json(
      { responsables: [], conductors: [], treballadors: [], error: 'Missing parameters' },
      { status: 400 }
    )
  }

  try {
    const deptNorm = norm(deptParam)
    const reqStart = buildDate(sd, st || '00:00')
    const reqEnd = buildDate(ed, et || '23:59')
    const reqRange = normalizeRange(reqStart, reqEnd)
    const premisesRules = await loadPersonnelRules(deptNorm)

    const occupancyIndex = new Map<string, OccupiedRange[]>()
    const colIds = await listQuadrantCollections()

    for (const colId of colIds) {
      try {
        const docs = await fetchQuadrantDocsByEndDate(colId, ed, sd)
        docs.forEach((docSnap) => {
          if (excludeEventId && docSnap.id === excludeEventId) return
          const q = docSnap.data() as QuadrantOccupancyDoc
          if (excludeEventId && q?.eventId === excludeEventId) return
          if (!shouldCountQuadrantOccupancy(q)) return

          const baseSource = {
            collection: colId,
            docId: docSnap.id,
            eventId: String(q?.eventId || '').trim() || docSnap.id,
            status: String(q?.status || '').trim() || undefined,
          }

          addRangesFromRef(occupancyIndex, q.responsable || null, q, {
            ...baseSource,
            role: 'responsable',
          })
          if (q.responsableName)
            addRangesFromRef(occupancyIndex, { name: q.responsableName }, q, {
              ...baseSource,
              role: 'responsableName',
            })
          if (Array.isArray(q.responsables))
            q.responsables.forEach((line) =>
              addRangesFromRef(occupancyIndex, line, q, { ...baseSource, role: 'responsables' })
            )
          if (Array.isArray(q.conductors))
            q.conductors.forEach((line) =>
              addRangesFromRef(occupancyIndex, line, q, { ...baseSource, role: 'conductors' })
            )
          if (Array.isArray(q.treballadors))
            q.treballadors.forEach((line) =>
              addRangesFromRef(occupancyIndex, line, q, { ...baseSource, role: 'treballadors' })
            )
          const legacyExternalWorkers = readLegacyExternalWorkersFromDoc(q)
          legacyExternalWorkers.forEach((line) =>
            addRangesFromRef(occupancyIndex, line, q, { ...baseSource, role: 'legacyExternalWorkers' })
          )
          if (Array.isArray(q.groups)) {
            q.groups.forEach((group) => {
              addRangesFromRef(
                occupancyIndex,
                {
                  id: group.responsibleId || undefined,
                  name: group.responsibleName || undefined,
                  startDate: group.startDate,
                  startTime: group.startTime,
                  endDate: group.endDate,
                  endTime: group.endTime,
                },
                q,
                { ...baseSource, role: 'groups.responsible' }
              )
            })
          }
        })
      } catch (error) {
        console.error(`[available] Error reading ${colId}:`, error)
      }
    }

    /**
     * Finestra ampliada per cobrir comprovacions de descans minim
     * (mateix marge que personnelRest.REST_LOOKBACK_DAYS).
     */
    const MAINTENANCE_LOOKBACK_DAYS = 7
    const lookbackDate = new Date(`${sd}T00:00:00Z`)
    lookbackDate.setUTCDate(lookbackDate.getUTCDate() - MAINTENANCE_LOOKBACK_DAYS)
    const lookbackIso = lookbackDate.toISOString().slice(0, 10)
    const lookbackMs = lookbackDate.getTime()
    const upperMs = new Date(`${ed}T23:59:59Z`).getTime()

    try {
      const plannedSnap = await db
        .collection('maintenancePreventiusPlanned')
        .where('date', '>=', lookbackIso)
        .where('date', '<=', ed)
        .get()
      plannedSnap.docs.forEach((doc) => {
        if (excludeMaintenancePlannedId && doc.id === excludeMaintenancePlannedId) return
        const data = doc.data() as MaintenancePlannedDoc
        const date = String(data.date || '').trim()
        const startTime = String(data.startTime || '').trim()
        const endTime = String(data.endTime || '').trim()
        if (!date || !startTime || !endTime) return
        const start = buildDate(date, startTime)
        const end = buildDate(date, endTime)
        addMaintenanceRange(
          occupancyIndex,
          start,
          end,
          date,
          Array.isArray(data.workerIds) ? data.workerIds : [],
          Array.isArray(data.workerNames) ? data.workerNames : [],
          {
            collection: 'maintenancePreventiusPlanned',
            docId: doc.id,
            eventId: doc.id,
            status: 'planned',
            role: 'maintenance',
          }
        )
      })
    } catch (error) {
      console.error('[available] Error reading maintenancePreventiusPlanned:', error)
    }

    try {
      const ticketsSnap = await db
        .collection('maintenanceTickets')
        .where('plannedStart', '>=', lookbackMs)
        .where('plannedStart', '<=', upperMs)
        .get()
      ticketsSnap.docs.forEach((doc) => {
        if (excludeMaintenanceTicketId && doc.id === excludeMaintenanceTicketId) return
        const data = doc.data() as MaintenanceTicketDoc
        if (!data.plannedStart || !data.plannedEnd) return
        const start = new Date(Number(data.plannedStart))
        const end = new Date(Number(data.plannedEnd))
        addMaintenanceRange(
          occupancyIndex,
          start,
          end,
          start.toISOString().slice(0, 10),
          Array.isArray(data.assignedToIds) ? data.assignedToIds : [],
          Array.isArray(data.assignedToNames) ? data.assignedToNames : [],
          {
            collection: 'maintenanceTickets',
            docId: doc.id,
            eventId: doc.id,
            status: 'planned',
            role: 'maintenance',
          }
        )
      })
    } catch (error) {
      console.error('[available] Error reading maintenanceTickets:', error)
    }

    /**
     * Personal: filtrar per departmentLower (indexat) en lloc de
     * llegir tota la col·leccio i filtrar en memoria. Si el camp
     * encara no esta migrat a alguns docs, aplicar fallback.
     */
    let deptPersonnel: FirebaseFirestore.QueryDocumentSnapshot[] = []
    try {
      const lowerSnap = await db
        .collection('personnel')
        .where('departmentLower', '==', deptNorm)
        .get()
      deptPersonnel = lowerSnap.docs
    } catch {}

    if (deptPersonnel.length === 0) {
      try {
        const exactSnap = await db
          .collection('personnel')
          .where('department', '==', deptParam)
          .get()
        deptPersonnel = exactSnap.docs
      } catch {}
    }

    if (deptPersonnel.length === 0) {
      const personnelSnap = await db.collection('personnel').get()
      deptPersonnel = personnelSnap.docs.filter((doc) => {
        const data = doc.data() as PersonnelDoc
        return norm(data.department) === deptNorm
      })
    }

    const responsables: AvailEntry[] = []
    const workers: AvailEntry[] = []
    const conductors: AvailEntry[] = []

    for (const doc of deptPersonnel) {
      const data = doc.data() as PersonnelDoc
      const roleNorm = norm(data.role)
      const personRanges = [
        ...(occupancyIndex.get(norm(doc.id)) || []),
        ...(occupancyIndex.get(norm(data.name)) || []),
      ]

      let hasOverlap = false
      let hasSameDayViolation = false
      let hasRestViolation = false
      const debugMatches: Array<{
        reason: string
        source?: OccupiedRange['source']
        busyStart: string
        busyEnd: string
      }> = []

      for (const range of personRanges) {
        const result = evaluateRangeEligibility({
          reqStart: reqRange.start,
          reqEnd: reqRange.end,
          reqStartDate: sd,
          busyStart: range.start,
          busyEnd: range.end,
          busyStartDate: range.startDate,
          ctx: premisesRules,
        })
        if (!result.eligible) {
          if (result.reason === 'overlap') hasOverlap = true
          if (result.reason === 'same_day_not_allowed') hasSameDayViolation = true
          if (result.reason === 'rest_violation') hasRestViolation = true
          if (
            debugPersonNorm &&
            (norm(doc.id) === debugPersonNorm || norm(data.name) === debugPersonNorm)
          ) {
            debugMatches.push({
              reason: result.reason,
              source: range.source,
              busyStart: range.start.toISOString(),
              busyEnd: range.end.toISOString(),
            })
          }
        }
      }

      const isAvailable = !hasOverlap && !hasSameDayViolation && !hasRestViolation
      const reason = hasOverlap
        ? 'Ja assignat en aquest rang'
        : hasSameDayViolation
        ? 'No pot fer dos serveis el mateix dia'
        : hasRestViolation
        ? `No compleix descans minim (${premisesRules.restHours}h)`
        : ''

      const isDriver =
        data.isDriver === true ||
        data.driver?.isDriver === true ||
        data.driver?.camioGran === true ||
        data.driver?.camioPetit === true ||
        data.camioGran === true ||
        data.camioPetit === true

      const entry: AvailEntry = {
        id: doc.id,
        name: data.name || '',
        role: data.role || '',
        status: isAvailable ? 'available' : 'conflict',
        reason,
        isDriver,
        isJamonero: data.isJamonero === true,
        isResponsible: data.isResponsible === true,
        camioPetit: data.driver?.camioPetit === true || data.camioPetit === true,
        camioGran: data.driver?.camioGran === true || data.camioGran === true,
      }

      if (personIsResponsible(data)) {
        responsables.push(entry)
        workers.push(entry)
      }
      if (TREBALLADOR_ROLES.has(roleNorm)) {
        workers.push(entry)
      }

      if (isDriver) {
        const capability = {
          isDriver: data.isDriver === true || data.driver?.isDriver === true,
          camioPetit: data.driver?.camioPetit === true || data.camioPetit === true,
          camioGran: data.driver?.camioGran === true || data.camioGran === true,
        }
        const okForVehicleType =
          !vehicleTypeNorm || canDriverHandleVehicleType(capability, vehicleTypeNorm)
        if (okForVehicleType) {
          conductors.push(entry)
        }
      }

      if (
        debugPersonNorm &&
        (norm(doc.id) === debugPersonNorm || norm(data.name) === debugPersonNorm) &&
        debugMatches.length > 0
      ) {
        const expandedMatches = debugMatches.map((match) => ({
          reason: match.reason,
          busyStart: match.busyStart,
          busyEnd: match.busyEnd,
          collection: match.source?.collection || null,
          docId: match.source?.docId || null,
          eventId: match.source?.eventId || null,
          status: match.source?.status || null,
          role: match.source?.role || null,
          personKey: match.source?.personKey || null,
        }))
        console.warn('[available][debugPerson] conflictes detectats', {
          requestedPerson: debugPerson,
          personId: doc.id,
          personName: data.name || '',
          requestedRange: {
            startDate: sd,
            endDate: ed,
            startTime: st || '00:00',
            endTime: et || '23:59',
          },
          matches: expandedMatches,
        })
      }
    }

    const sortEntries = (items: AvailEntry[]) =>
      uniqueById(items).sort((a, b) =>
        a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'available' ? -1 : 1
      )

    const filteredResponsables = cleanAvailabilityList(sortEntries(responsables), excludeIds, excludeNames)
    const filteredConductors = cleanAvailabilityList(sortEntries(conductors), excludeIds, excludeNames)
    const filteredWorkers = cleanAvailabilityList(sortEntries(workers), excludeIds, excludeNames)

    return NextResponse.json({
      responsables: includeConflicts
        ? filteredResponsables
        : filteredResponsables.filter((p) => p.status === 'available'),
      conductors: includeConflicts
        ? filteredConductors
        : filteredConductors.filter((p) => p.status === 'available'),
      treballadors: includeConflicts
        ? filteredWorkers
        : filteredWorkers.filter((p) => p.status === 'available'),
    })
  } catch (err: unknown) {
    console.error('Error GET /api/personnel/available:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

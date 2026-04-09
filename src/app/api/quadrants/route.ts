// src/app/api/quadrants/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { revalidateQuadrantsListCache } from '@/lib/quadrantsListCache'
import { autoAssign } from '@/services/autoAssign'
import { loadDepartmentPersonnel, loadPremises, type DriverCrewPremise } from '@/services/premises'
import { getSurveyPreferredCandidates } from '@/lib/quadrantSurveys'
import { buildLedger } from '@/services/workloadLedger'

export const runtime = 'nodejs'
const ORIGIN = 'MolÃ­ Vinyals, 11, 08776 Sant Pere de Riudebitlles, Barcelona'
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY

// Helpers
const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (v?: string | null) => unaccent((v || '').toString().trim().toLowerCase())
const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

/** Reparteix M elements en `phaseCount` trossos contigus (cap solapament); suma dels trossos = M. */
function partitionAssignmentsAcrossPhases<T>(items: T[], phaseCount: number): T[][] {
  if (phaseCount <= 0) return []
  const n = items.length
  const result: T[][] = []
  const base = Math.floor(n / phaseCount)
  let extra = n % phaseCount
  let offset = 0
  for (let i = 0; i < phaseCount; i++) {
    const size = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra -= 1
    result.push(items.slice(offset, offset + size))
    offset += size
  }
  return result
}
const calcDistanceKm = async (destination: string): Promise<number | null> => {
  if (!GOOGLE_KEY || !destination) return null
  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
    url.searchParams.set('origins', ORIGIN)
    url.searchParams.set('destinations', destination)
    url.searchParams.set('key', GOOGLE_KEY)
    url.searchParams.set('mode', 'driving')

    const res = await fetch(url.toString())
    if (!res.ok) return null
    const json = await res.json()
    const el = json?.rows?.[0]?.elements?.[0]
    if (el?.status !== 'OK') return null
    const meters = el.distance?.value
    if (!meters) return null
    return (meters / 1000) * 2 // anada + tornada
  } catch (err) {
    console.warn('[quadrants/route] distance error', err)
    return null
  }
}

/** Construeix el nom de colÂ·lecciÃ³ per departament: quadrantsLogistica, quadrantsServeis, ... */
/** Retorna el nom de colÂ·lecciÃ³ existent per al departament (singular o plural). */
async function resolveWriteCollectionForDepartment(department: string) {
  const d = capitalize(norm(department))
  const plural = `quadrants${d}`
  const singular = `quadrant${d}`

  // Comprova si existeix el singular
  const all = await db.listCollections()
  const names = all.map(c => c.id.toLowerCase())

  // Prioritza la que existeixi (singular en el teu cas actual)
  if (names.includes(singular.toLowerCase())) return singular
  if (names.includes(plural.toLowerCase())) return plural

  // Si no existeix cap, crea/escriu al plural per estandarditzar
  return plural
}


/* ================= Tipus ================= */
interface CuinaGroup {
  meetingPoint: string
  startTime: string
  arrivalTime?: string | null
  endTime: string
  workers: number
  drivers: number
  needsDriver?: boolean
  wantsResponsible?: boolean
  driverName?: string | null
  responsibleId?: string | null
  responsibleName?: string | null
}

interface QuadrantSave {
  code: string
  eventId: string
  eventName: string
  location: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  department: string
  status: string
  numDrivers: number
  totalWorkers: number
  numPax?: number | null
  responsableName: string | null
  responsable: { name: string; meetingPoint: string } | null
  conductors: Array<{ name: string; meetingPoint: string; plate: string; vehicleType: string }>
  treballadors: Array<{
    name: string
    meetingPoint: string
    startDate?: string
    endDate?: string
    startTime?: string
    endTime?: string
    arrivalTime?: string | null
    isExternal?: boolean
  }>
  needsReview: boolean
  violations: string[]
  attentionNotes: string[]
  updatedAt: string
  legacyBrigades?: Array<Record<string, unknown>>
  groups?: Array<{
    meetingPoint: string
    startTime: string
    arrivalTime?: string | null
    endTime: string
    workers: number
    drivers: number
    responsibleId?: string | null
    responsibleName?: string | null
  }>
  cuinaGroupCount?: number
  service?: string | null
  arrivalTime?: string | null
  distanceKm?: number | null
  distanceCalcAt?: string | null
  timetables?: Array<{ startTime: string; endTime: string }>
  phaseType?: string | null
  phaseLabel?: string | null
  phaseDate?: string | null
  /** Model de vestimenta triat en crear el quadrant (Serveis). */
  vestimentModel?: string | null
}

async function enrichWithSurveyPreferences(
  payload: any,
  department: string,
  surveyPreferred?: { yes: string[]; maybe: string[] }
) {
  const eventId = normalizeEventId(String(payload?.eventId || ''))
  const serviceDate = String(payload?.phaseDate || payload?.startDate || '').slice(0, 10)
  if (!eventId || !serviceDate) return payload

  const resolvedSurveyPreferred =
    surveyPreferred ||
    (await getSurveyPreferredCandidates({
      eventId,
      department,
      serviceDate,
    }))

  const mergedPreferredStaffNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredStaffNames) ? payload.preferredStaffNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const mergedPreferredDriverNames = Array.from(
    new Set([
      ...(Array.isArray(payload?.preferredDriverNames) ? payload.preferredDriverNames : []),
      ...resolvedSurveyPreferred.yes,
      ...resolvedSurveyPreferred.maybe,
    ].filter(Boolean))
  )
  const preferredResponsibleName =
    payload?.preferredResponsibleName ||
    resolvedSurveyPreferred.yes[0] ||
    resolvedSurveyPreferred.maybe[0] ||
    null

  return {
    ...payload,
    preferredStaffNames: mergedPreferredStaffNames,
    preferredDriverNames: mergedPreferredDriverNames,
    preferredResponsibleName,
  }
}

const getDateWindow = (startISODate: string) => {
  const d = new Date(`${startISODate}T00:00:00`)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  const weekStart = new Date(d)
  weekStart.setDate(d.getDate() - (day - 1))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const [ws, we, ms, me] = [weekStart, weekEnd, monthStart, monthEnd].map((x) =>
    x.toISOString().slice(0, 10)
  )
  return { ws, we, ms, me }
}

/* ================= Handler ================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const canonicalEventId = normalizeEventId(String(body?.eventId || ''))
    let cachedDepartmentPeople:
      | Awaited<ReturnType<typeof loadDepartmentPersonnel>>
      | null = null
    let cachedPremisesData:
      | Awaited<ReturnType<typeof loadPremises>>
      | null = null
    const surveyPreferredCache = new Map<string, Awaited<ReturnType<typeof getSurveyPreferredCandidates>>>()
    const ledgerCache = new Map<string, Awaited<ReturnType<typeof buildLedger>>>()

    const required = ['eventId', 'department', 'startDate', 'endDate']
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ success: false, error: `Missing ${k}` }, { status: 400 })
      }
    }

    const deptNorm = norm(String(body.department || ''))
    const collectionName = await resolveWriteCollectionForDepartment(deptNorm)
    console.log('[quadrants/route] Escriurà a col·lecció:', collectionName)

    const getDepartmentPeople = async () => {
      if (!cachedDepartmentPeople) {
        cachedDepartmentPeople = await loadDepartmentPersonnel(deptNorm)
      }
      return cachedDepartmentPeople
    }

    const getPremisesData = async () => {
      if (!cachedPremisesData) {
        cachedPremisesData = await loadPremises(deptNorm, await getDepartmentPeople())
      }
      return cachedPremisesData
    }

    const getSurveyPreferred = async (serviceDate: string) => {
      const key = `${canonicalEventId}__${deptNorm}__${String(serviceDate || '').slice(0, 10)}`
      if (!surveyPreferredCache.has(key)) {
        surveyPreferredCache.set(
          key,
          await getSurveyPreferredCandidates({
            eventId: canonicalEventId,
            department: deptNorm,
            serviceDate: String(serviceDate || '').slice(0, 10),
          })
        )
      }
      return surveyPreferredCache.get(key) || { yes: [], maybe: [] }
    }

    const getLedgerForDate = async (serviceDate: string) => {
      const { ws, we, ms, me } = getDateWindow(serviceDate)
      const key = `${deptNorm}__${ws}__${we}__${ms}__${me}`
      if (!ledgerCache.has(key)) {
        ledgerCache.set(
          key,
          await buildLedger(deptNorm, ws, we, ms, me, {
            includeAllDepartmentsForBusy: true,
          })
        )
      }
      return ledgerCache.get(key) as Awaited<ReturnType<typeof buildLedger>>
    }

    const assignBody =
      deptNorm === 'serveis' &&
      Array.isArray(body.groups) &&
      body.groups.length > 0
        ? {
            ...body,
            startDate: body.groups[0]?.serviceDate || body.startDate,
            endDate: body.groups[0]?.serviceDate || body.endDate,
            startTime: body.groups[0]?.startTime || body.startTime,
            endTime: body.groups[0]?.endTime || body.endTime,
          }
        : body

    const logisticaPhasesIn = Array.isArray(body.logisticaPhases)
      ? body.logisticaPhases
      : []

    const buildToSave = (
      bodyForSave: any,
      assignmentForSave: {
        responsible?: { name: string } | null
        drivers?: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
        staff?: Array<{ name: string; meetingPoint?: string }>
      },
      metaForSave: { needsReview?: boolean; violations?: string[]; notes?: string[] }
    ) => {
      const normalizeTimeField = (value: unknown) =>
        typeof value === 'string' ? value.trim() : ''

      const toTimetableEntry = ({
        startTime,
        endTime,
      }: { startTime?: unknown; endTime?: unknown }) => {
        const start = normalizeTimeField(startTime)
        const end = normalizeTimeField(endTime)
        return start && end ? { startTime: start, endTime: end } : null
      }

      const rawTimetables = Array.isArray(bodyForSave.timetables)
        ? bodyForSave.timetables
        : []
      const normalizedTimetables = rawTimetables
        .map((entry: any) => toTimetableEntry(entry))
        .filter((entry): entry is { startTime: string; endTime: string } => Boolean(entry))

      const staffRaw = (assignmentForSave.staff || []).filter((s) => s?.name)
      const externalWorkersRaw = Array.isArray(bodyForSave.externalWorkers)
        ? bodyForSave.externalWorkers.filter((s: any) => s?.name)
        : []
      let extraCount = staffRaw.filter((s) => s.name === 'Extra').length
      let staffClean = staffRaw.filter((s) => s.name !== 'Extra')

      const toSave: QuadrantSave = {
        code: bodyForSave.code || '',
        eventId: normalizeEventId(bodyForSave.eventId),
        eventName: bodyForSave.eventName || '',
        location: bodyForSave.location || '',
        meetingPoint: bodyForSave.meetingPoint || '',
        startDate: bodyForSave.startDate,
        startTime: bodyForSave.startTime || '00:00',
        endDate: bodyForSave.endDate,
        endTime: bodyForSave.endTime || '00:00',
        arrivalTime: bodyForSave.arrivalTime || null,
        department: deptNorm,
        status: 'draft',
        numDrivers: Number(bodyForSave.numDrivers || 0),
        totalWorkers: Number(bodyForSave.totalWorkers || 0),
        numPax: bodyForSave.numPax ?? null,
        service: bodyForSave.service || null,
        phaseType: bodyForSave.phaseType || (deptNorm === 'cuina' ? 'event' : null),
        phaseLabel: bodyForSave.phaseLabel || (deptNorm === 'cuina' ? 'Event' : null),
        phaseDate: bodyForSave.phaseDate || null,

        responsableName: assignmentForSave.responsible?.name || null,
        responsable: assignmentForSave.responsible
          ? { name: assignmentForSave.responsible.name, meetingPoint: bodyForSave.meetingPoint || '' }
          : null,

        conductors: (assignmentForSave.drivers || []).map((d) => ({
          name: d.name,
          meetingPoint: d.meetingPoint || bodyForSave.meetingPoint || '',
          plate: d.plate || '',
          vehicleType: d.vehicleType || '',
          isJamonero: (d as any).isJamonero === true,
        })),

        treballadors: [
          ...staffClean.map((s) => ({
            name: s.name,
            meetingPoint: s.meetingPoint || bodyForSave.meetingPoint || '',
            isJamonero: (s as any).isJamonero === true,
          })),
          ...externalWorkersRaw.map((worker: any) => ({
            name: worker.name,
            meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
            startDate: worker.startDate || bodyForSave.startDate,
            endDate: worker.endDate || bodyForSave.endDate,
            startTime: worker.startTime || bodyForSave.startTime || '00:00',
            endTime: worker.endTime || bodyForSave.endTime || '00:00',
            arrivalTime: worker.arrivalTime || bodyForSave.arrivalTime || null,
            isExternal: worker.isExternal === true,
          })),
        ],

        needsReview: !!metaForSave.needsReview,
        violations: metaForSave.violations || [],
        attentionNotes: metaForSave.notes || [],
        updatedAt: new Date().toISOString(),
        timetables: normalizedTimetables,
        vestimentModel:
          deptNorm === 'serveis'
            ? (typeof bodyForSave.vestimentModel === 'string'
                ? bodyForSave.vestimentModel.trim() || null
                : null)
            : null,
      }

      if (!toSave.responsableName && bodyForSave.manualResponsibleName) {
        toSave.responsableName = String(bodyForSave.manualResponsibleName)
        toSave.responsable = {
          name: String(bodyForSave.manualResponsibleName),
          meetingPoint: bodyForSave.meetingPoint || '',
        }
      }

      if (Array.isArray(bodyForSave.groups)) {
        if (deptNorm === 'serveis') {
          toSave.groups = bodyForSave.groups.map((g: any) => ({
            wantsResponsible: g.wantsResponsible !== false,
            id: g.id || null,
            serviceDate: g.serviceDate || null,
            dateLabel: g.dateLabel || null,
            meetingPoint: g.meetingPoint || '',
            startTime: g.startTime || '',
            endTime: g.endTime || '',
            workers: Number(g.workers || 0),
            jamoneros: Number(g.jamoneros || bodyForSave.jamoneroCount || 0),
            drivers: Number(g.drivers || 0),
            needsDriver: !!g.needsDriver,
            driverId: g.driverId || null,
            driverName:
              g.driverName ||
              assignmentForSave.drivers?.find((driver, idx) =>
                idx < Math.max(1, Number(g.drivers || 0))
              )?.name ||
              null,
            responsibleId: g.responsibleId || null,
            responsibleName:
              (g.wantsResponsible !== false
                ? g.responsibleName ||
                  assignmentForSave.responsible?.name ||
                  g.driverName ||
                  assignmentForSave.drivers?.find((driver, idx) =>
                    idx < Math.max(1, Number(g.drivers || 0))
                  )?.name ||
                  null
                : null),
          }))
        } else {
          const normalizePerson = (value?: string | null) =>
            (value || '').toString().trim().toLowerCase()
          const remainingDrivers = [...(assignmentForSave.drivers || [])]
          let workerIdx = 0
          const usedNames = new Set<string>()
          const computedGroups = (bodyForSave.groups as CuinaGroup[]).map((group) => {
            const needsDriver = group.needsDriver ?? Number(group.drivers || 0) > 0
            const driversNeeded = needsDriver ? Math.max(1, Number(group.drivers || 0)) : 0
            const preferredDriverName = normalizePerson(group.driverName)
            const driversSlice: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }> = []

            if (driversNeeded > 0 && preferredDriverName) {
              const preferredIdx = remainingDrivers.findIndex(
                (driver) => normalizePerson(driver?.name) === preferredDriverName
              )
              if (preferredIdx >= 0) {
                const [preferred] = remainingDrivers.splice(preferredIdx, 1)
                if (preferred) driversSlice.push(preferred)
              }
            }

            while (driversSlice.length < driversNeeded && remainingDrivers.length > 0) {
              const next = remainingDrivers.shift()
              if (!next) break
              driversSlice.push(next)
            }

            const wantsResponsible = group.wantsResponsible !== false
            let responsibleName = wantsResponsible ? group.responsibleName || null : null
            if (responsibleName && usedNames.has(responsibleName.toLowerCase().trim())) {
              responsibleName = null
            }

            const workersNeeded = Math.max(
              Number(group.workers || 0) - driversNeeded,
              0
            )

            const workersSlice: Array<{ name: string; meetingPoint?: string }> = []
            while (workersSlice.length < workersNeeded) {
              const next = (assignmentForSave.staff || [])[workerIdx]
              workerIdx += 1
              if (!next) {
                workersSlice.push({ name: 'Extra' })
                continue
              }
              const normName = next.name?.toLowerCase().trim()
              if (normName && usedNames.has(normName)) continue
              workersSlice.push(next)
            }

            if (wantsResponsible && !responsibleName && deptNorm === 'cuina') {
              // A cuina prioritzem conductor com a responsable quan el grup en necessita.
              const candidateDriver = driversSlice.find((p) => p?.name && p.name !== 'Extra')
              const candidateWorker = workersSlice.find((p) => p?.name && p.name !== 'Extra')
              responsibleName = candidateDriver?.name || candidateWorker?.name || null
            }

            const groupNames = [
              responsibleName,
              ...driversSlice.map((d) => d?.name),
              ...workersSlice.map((w) => w?.name),
            ]
              .filter((name) => typeof name === 'string' && name && name !== 'Extra')
              .map((name) => (name as string).toLowerCase().trim())
            groupNames.forEach((name) => usedNames.add(name))

            return { ...group, needsDriver, drivers: driversNeeded, wantsResponsible, responsibleName }
          })

          toSave.groups = computedGroups

          if (deptNorm === 'cuina' && !toSave.responsableName) {
            const firstGroupResponsible = computedGroups.find(
              (group) => group.wantsResponsible !== false && group.responsibleName
            )
            const fallbackName =
              firstGroupResponsible?.responsibleName ||
              [...toSave.conductors, ...toSave.treballadors].find(
                (person) =>
                  person?.name &&
                  person.name !== 'Extra' &&
                  ((person as any).isExternal !== true) &&
                  !String(person.name).toLowerCase().startsWith('ett')
              )?.name ||
              null

            if (fallbackName) {
              toSave.responsableName = fallbackName
              toSave.responsable = {
                name: fallbackName,
                meetingPoint:
                  firstGroupResponsible?.meetingPoint ||
                  computedGroups[0]?.meetingPoint ||
                  bodyForSave.meetingPoint ||
                  '',
              }
            }
          }

          if (deptNorm === 'cuina') {
            const responsibleNames = new Set<string>()
            const topResponsible = normalizePerson(toSave.responsableName)
            if (topResponsible) responsibleNames.add(topResponsible)
            computedGroups.forEach((group) => {
              if (group.wantsResponsible === false) return
              const groupResponsible = normalizePerson(group.responsibleName)
              if (groupResponsible) responsibleNames.add(groupResponsible)
            })

            const driverNames = new Set<string>()
            toSave.conductors = toSave.conductors.filter((driver) => {
              const normalized = normalizePerson(driver?.name)
              if (!normalized) return false
              if (driverNames.has(normalized)) return false
              driverNames.add(normalized)
              return true
            })

            const reservedNames = new Set<string>([...responsibleNames, ...driverNames])
            const uniqueWorkers: Array<{ name: string; meetingPoint: string }> = []
            const seenWorkers = new Set<string>()
            staffClean.forEach((worker) => {
              const normalized = normalizePerson(worker.name)
              if (!normalized || normalized === 'extra') return
              if (reservedNames.has(normalized)) return
              if (seenWorkers.has(normalized)) return
              seenWorkers.add(normalized)
              uniqueWorkers.push({
                name: worker.name,
                meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
              })
            })

            const externalWorkerLines = externalWorkersRaw.map((worker: any) => ({
              name: worker.name,
              meetingPoint: worker.meetingPoint || bodyForSave.meetingPoint || '',
              startDate: worker.startDate || bodyForSave.startDate,
              endDate: worker.endDate || bodyForSave.endDate,
              startTime: worker.startTime || bodyForSave.startTime || '00:00',
              endTime: worker.endTime || bodyForSave.endTime || '00:00',
              arrivalTime: worker.arrivalTime || bodyForSave.arrivalTime || null,
              isExternal: worker.isExternal === true,
            }))

            const targetWorkers = Math.max(
              Number(bodyForSave.totalWorkers || 0) -
                Number(bodyForSave.numDrivers || 0) -
                responsibleNames.size,
              0
            )

            while (uniqueWorkers.length < targetWorkers) {
              uniqueWorkers.push({
                name: 'Extra',
                meetingPoint: bodyForSave.meetingPoint || '',
              })
            }

            toSave.treballadors = [...uniqueWorkers, ...externalWorkerLines]
            extraCount = uniqueWorkers.filter((worker) => worker.name === 'Extra').length
          }
        }
      }

      if (bodyForSave.cuinaGroupCount) {
        toSave.cuinaGroupCount = Number(bodyForSave.cuinaGroupCount)
      }

      toSave.totalWorkers =
        Math.max(Number(toSave.totalWorkers || 0), 0) + Number(externalWorkersRaw.length || 0)

      return { toSave }
    }

    const applyStageData = async (toSave: QuadrantSave) => {
      const baseEventId = normalizeEventId(String(body.eventId || ''))
      const stageDocId = baseEventId || canonicalEventId
      const stageSnap = await db.collection('stage_verd').doc(stageDocId).get()
      const stageData = stageSnap.exists ? stageSnap.data() : null

      if (!toSave.code) {
        toSave.code = stageData?.code || stageData?.C_digo || ''
      }
      if (baseEventId) {
        toSave.eventId = baseEventId
      }

      const destination =
        stageData?.Ubicacio ||
        stageData?.location ||
        stageData?.address ||
        toSave.location
      const km = await calcDistanceKm(destination || '')
      if (km) {
        toSave.distanceKm = km
        toSave.distanceCalcAt = new Date().toISOString()
      }
    }

    const normalizePerson = (value?: string | null) =>
      (value || '').toString().trim().toLowerCase()

    let phaseRequests: Array<any> = []
    let remainingServiceJamoneroAssignments = Array.isArray(body.serviceJamoneroAssignments)
      ? body.serviceJamoneroAssignments.map((assignment: any, index: number) => ({
          id: String(assignment?.id || `jamonero-${index + 1}`),
          mode: assignment?.mode === 'manual' ? 'manual' : 'auto',
          personnelId: assignment?.personnelId ? String(assignment.personnelId) : null,
          personnelName: assignment?.personnelName ? String(assignment.personnelName) : null,
        }))
      : []
    let remainingServiceEventGroups = 0

    const consumeServiceJamoneros = (
      assignment: {
        responsible?: { name: string } | null
        drivers?: Array<{ name?: string; isJamonero?: boolean }>
        staff?: Array<{ name?: string; isJamonero?: boolean }>
      }
    ) => {
      if (!remainingServiceJamoneroAssignments.length) return

      const usedNames = [
        ...(assignment.drivers || [])
          .filter((person) => person?.isJamonero === true && person.name && person.name !== assignment.responsible?.name)
          .map((person) => String(person.name)),
        ...(assignment.staff || [])
          .filter((person) => person?.isJamonero === true && person.name)
          .map((person) => String(person.name)),
      ]

      if (!usedNames.length) return

      const normalizedUsed = usedNames.map((name) => normalizePerson(name))
      const matchedManualIds = new Set<string>()
      normalizedUsed.forEach((usedName) => {
        const manual = remainingServiceJamoneroAssignments.find(
          (assignment) =>
            assignment.mode === 'manual' &&
            assignment.personnelName &&
            normalizePerson(assignment.personnelName) === usedName
        )
        if (manual) matchedManualIds.add(manual.id)
      })

      let remainingAutoToConsume = Math.max(normalizedUsed.length - matchedManualIds.size, 0)
      remainingServiceJamoneroAssignments = remainingServiceJamoneroAssignments.filter((assignment) => {
        if (matchedManualIds.has(assignment.id)) return false
        if (assignment.mode === 'auto' && remainingAutoToConsume > 0) {
          remainingAutoToConsume -= 1
          return false
        }
        return true
      })
    }

    if (deptNorm === 'logistica' && logisticaPhasesIn.length > 0) {
      let phaseIndex = 0
      for (const p of logisticaPhasesIn) {
        phaseIndex += 1
        const rawLabel = (p.label || p.key || '').toString().trim()
        const label = rawLabel || `Fase ${phaseIndex}`
        const phaseType = norm(label)
        phaseRequests.push({
          label,
          phaseType,
          date: p.date || body.startDate,
          endDate: p.endDate || p.date || body.endDate,
          startTime: p.startTime || body.startTime,
          endTime: p.endTime || body.endTime,
          totalWorkers: Number(p.totalWorkers || 0),
          numDrivers: Number(p.numDrivers || 0),
          wantsResp: !!p.wantsResp,
          responsableId: p.responsableId || null,
          meetingPoint: p.meetingPoint || body.meetingPoint || '',
          vehicles: Array.isArray(p.vehicles) ? p.vehicles : [],
        })
      }
    } else if (deptNorm === 'serveis' && Array.isArray(body.groups) && body.groups.length > 0) {
      const eventDate = body.startDate
      const serviceAssignments = Array.isArray(body.serviceJamoneroAssignments)
        ? body.serviceJamoneroAssignments
        : []
      const manualServiceJamonero = serviceAssignments.find(
        (assignment: any) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
      )
      const hasAutoServiceJamonero = serviceAssignments.some(
        (assignment: any) => assignment?.mode !== 'manual'
      )
      const departmentPeople =
        manualServiceJamonero || hasAutoServiceJamonero
          ? await getDepartmentPeople()
          : []
      const premisesData =
        manualServiceJamonero || hasAutoServiceJamonero
          ? await getPremisesData()
          : { premises: { driverCrews: [] as DriverCrewPremise[] } }
      const driverCrews = Array.isArray(premisesData?.premises?.driverCrews)
        ? premisesData.premises.driverCrews
        : []
      const findPerson = (ref?: { id?: string | null; name?: string | null }) =>
        departmentPeople.find((person) => {
          if (ref?.id && person.id === ref.id) return true
          if (ref?.name && norm(person.name) === norm(ref.name)) return true
          return false
        }) || null
      const findCrewByDriver = (ref?: { id?: string | null; name?: string | null }) =>
        driverCrews.find((crew) => {
          const driver = findPerson({ id: crew.driverId, name: crew.driverName })
          if (!driver) return false
          if (ref?.id && driver.id === ref.id) return true
          if (ref?.name && norm(driver.name) === norm(ref.name)) return true
          return false
        }) || null
      const findCrewByCompanion = (ref?: { id?: string | null; name?: string | null }) =>
        driverCrews.find((crew) =>
          crew.companions.some((companion) => {
            const companionPerson = findPerson({ id: companion.id, name: companion.name })
            if (!companionPerson) return false
            if (ref?.id && companionPerson.id === ref.id) return true
            if (ref?.name && norm(companionPerson.name) === norm(ref.name)) return true
            return false
          })
        ) || null
      const crewContainsPerson = (crew: DriverCrewPremise | null, person: { id?: string | null; name?: string | null } | null) => {
        if (!crew || !person) return false
        const driver = findPerson({ id: crew.driverId, name: crew.driverName })
        if (driver) {
          if (person.id && driver.id === person.id) return true
          if (person.name && norm(driver.name) === norm(person.name)) return true
        }
        return crew.companions.some((companion) => {
          const companionPerson = findPerson({ id: companion.id, name: companion.name })
          if (!companionPerson) return false
          if (person.id && companionPerson.id === person.id) return true
          if (person.name && norm(companionPerson.name) === norm(person.name)) return true
          return false
        })
      }
      const existingGroupMatchesCrew = (
        groups: any[],
        currentIndex: number,
        driverId?: string | null,
        serviceDate?: string
      ) =>
        groups.some((candidate, candidateIndex) => {
          if (candidateIndex === currentIndex) return false
          const candidateDate = candidate?.serviceDate || body.startDate
          if (serviceDate && candidateDate !== serviceDate) return false
          const candidateLabel =
            (candidate?.dateLabel || '').toString().trim() ||
            (candidateDate === eventDate ? 'Event' : 'Muntatge')
          if (norm(candidateLabel) !== 'event') return false
          return Boolean(driverId) && String(candidate?.driverId || '').trim() === String(driverId || '').trim()
        })
      const existingEventGroupsCount = body.groups.filter((candidate: any) => {
        const candidateDate = candidate?.serviceDate || body.startDate
        if (candidateDate !== eventDate) return false
        const candidateLabel =
          (candidate?.dateLabel || '').toString().trim() ||
          (candidateDate === eventDate ? 'Event' : 'Muntatge')
        return norm(candidateLabel) === 'event'
      }).length
      const canAutoCreateExtraEventGroup =
        existingEventGroupsCount <= 1 && Array.isArray(body.groups) && body.groups.length === 1

      body.groups.forEach((g: any, groupIndex: number) => {
        const serviceDate = g.serviceDate || body.startDate
        const label =
          (g.dateLabel || '').toString().trim() ||
          (serviceDate === eventDate ? 'Event' : 'Muntatge')
        const wantsResp =
          typeof g.wantsResponsible === 'boolean'
            ? g.wantsResponsible
            : body.skipResponsible
            ? false
            : true
        const isPrimaryResponsibleEventGroup =
          groupIndex === 0 &&
          serviceDate === eventDate &&
          Boolean(body.manualResponsibleId)
        const responsableId =
          wantsResp && (g.responsibleId || (isPrimaryResponsibleEventGroup ? body.manualResponsibleId : null))
            ? g.responsibleId || (isPrimaryResponsibleEventGroup ? body.manualResponsibleId : null)
            : null

        const responsiblePerson =
          isPrimaryResponsibleEventGroup
            ? findPerson({ id: body.manualResponsibleId })
            : null
        const jamoneroPerson =
          groupIndex === 0 && serviceDate === eventDate && manualServiceJamonero
            ? findPerson({
                id: manualServiceJamonero.personnelId || null,
                name: manualServiceJamonero.personnelName || null,
              })
            : null
        const responsibleCrew = responsiblePerson
          ? responsiblePerson.isDriver
            ? findCrewByDriver({ id: responsiblePerson.id, name: responsiblePerson.name })
            : findCrewByCompanion({ id: responsiblePerson.id, name: responsiblePerson.name })
          : null
        const jamoneroCrew = jamoneroPerson
          ? jamoneroPerson.isDriver
            ? findCrewByDriver({ id: jamoneroPerson.id, name: jamoneroPerson.name })
            : findCrewByCompanion({ id: jamoneroPerson.id, name: jamoneroPerson.name })
          : null
        // 1) Preferir jamonero dins del mateix equip que el responsable/conductor (mateix cotxe).
        // 2) Si no n’hi ha, cercar jamonero d’un altre equip (només es parteix en 2 fases si no és «compacte»).
        let autoJamoneroPerson: (typeof departmentPeople)[number] | null = null
        if (
          !jamoneroPerson &&
          groupIndex === 0 &&
          serviceDate === eventDate &&
          responsibleCrew &&
          hasAutoServiceJamonero
        ) {
          const inResponsibleCrew = departmentPeople.find((person) => {
            if (person.isJamonero !== true) return false
            if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
            if (!crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
            const crewDriver = findPerson({
              id: responsibleCrew.driverId,
              name: responsibleCrew.driverName,
            })
            if (
              crewDriver &&
              responsiblePerson &&
              person.isDriver &&
              person.id === responsiblePerson.id
            ) {
              return false
            }
            return true
          })
          const fromOtherCrew =
            !inResponsibleCrew &&
            departmentPeople.find((person) => {
              if (person.isJamonero !== true) return false
              if (body.manualResponsibleId && person.id === body.manualResponsibleId) return false
              const personCrew = person.isDriver
                ? findCrewByDriver({ id: person.id, name: person.name })
                : findCrewByCompanion({ id: person.id, name: person.name })
              if (!personCrew) return false
              if (personCrew.id === responsibleCrew.id) return false
              if (crewContainsPerson(responsibleCrew, { id: person.id, name: person.name })) return false
              return true
            })
          autoJamoneroPerson = inResponsibleCrew || fromOtherCrew || null
        }
        const autoJamoneroCrew = autoJamoneroPerson
          ? autoJamoneroPerson.isDriver
            ? findCrewByDriver({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
            : findCrewByCompanion({ id: autoJamoneroPerson.id, name: autoJamoneroPerson.name })
          : null
        // Esdeveniments petits (treballadors + conductors demanats < 5): un sol vehicle amb el conductor principal.
        const serveisCompactHeadcount =
          Number(g.workers || 0) + Number(g.drivers || 0)
        const compactServeisSingleVehicle = serveisCompactHeadcount < 5

        const splitForManualJamonero =
          !compactServeisSingleVehicle &&
          label.toLowerCase() === 'event' &&
          canAutoCreateExtraEventGroup &&
          groupIndex === 0 &&
          jamoneroPerson &&
          responsibleCrew &&
          jamoneroCrew &&
          jamoneroCrew.id !== responsibleCrew.id &&
          !existingGroupMatchesCrew(body.groups, groupIndex, jamoneroCrew.driverId, serviceDate)
        const splitForAutoJamonero =
          !compactServeisSingleVehicle &&
          label.toLowerCase() === 'event' &&
          canAutoCreateExtraEventGroup &&
          groupIndex === 0 &&
          !manualServiceJamonero &&
          autoJamoneroPerson &&
          responsibleCrew &&
          autoJamoneroCrew &&
          autoJamoneroCrew.id !== responsibleCrew.id &&
          !existingGroupMatchesCrew(body.groups, groupIndex, autoJamoneroCrew.driverId, serviceDate)

        if (splitForManualJamonero || splitForAutoJamonero) {
          const selectedJamoneroPerson = jamoneroPerson || autoJamoneroPerson
          const selectedJamoneroCrew = jamoneroCrew || autoJamoneroCrew
          const selectedJamoneroAssignment = jamoneroPerson
            ? manualServiceJamonero
            : autoJamoneroPerson
            ? {
                id: `auto-jamonero-${autoJamoneroPerson.id}`,
                mode: 'manual',
                personnelId: autoJamoneroPerson.id,
                personnelName: autoJamoneroPerson.name,
              }
            : null

          if (!selectedJamoneroPerson || !selectedJamoneroCrew || !selectedJamoneroAssignment) {
            return
          }

          const secondGroupWorkers = selectedJamoneroPerson.isDriver ? 1 : 2
          const firstGroupWorkers = Math.max(Number(g.workers || 0) - secondGroupWorkers, 0)
          const secondGroupDriver = selectedJamoneroPerson.isDriver
            ? selectedJamoneroPerson
            : findPerson({ id: selectedJamoneroCrew?.driverId, name: selectedJamoneroCrew?.driverName })

          phaseRequests.push({
            groupId: `${g.id || 'group'}__g1`,
            label,
            phaseType: norm(label),
            date: serviceDate,
            endDate: serviceDate,
            startTime: g.startTime || body.startTime,
            endTime: g.endTime || body.endTime,
            totalWorkers: firstGroupWorkers,
            jamoneroCount: 0,
            numDrivers: 1,
            wantsResp: true,
            responsableId: body.manualResponsibleId,
            manualDriverId:
              responsiblePerson?.isDriver
                ? responsiblePerson.id
                : responsibleCrew?.driverId || null,
            meetingPoint: g.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...g,
                id: `${g.id || 'group'}__g1`,
                workers: firstGroupWorkers,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: true,
                responsibleId: body.manualResponsibleId,
                driverId:
                  responsiblePerson?.isDriver
                    ? responsiblePerson.id
                    : responsibleCrew?.driverId || '',
              },
            ],
            serviceJamoneroAssignmentsOverride: [],
          })

          phaseRequests.push({
            groupId: `${g.id || 'group'}__g2`,
            label,
            phaseType: norm(label),
            date: serviceDate,
            endDate: serviceDate,
            startTime: g.startTime || body.startTime,
            endTime: g.endTime || body.endTime,
            totalWorkers: secondGroupWorkers,
            jamoneroCount: 1,
            numDrivers: 1,
            wantsResp: false,
            responsableId: null,
            manualDriverId: secondGroupDriver?.id || null,
            meetingPoint: g.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...g,
                id: `${g.id || 'group'}__g2`,
                workers: secondGroupWorkers,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: false,
                responsibleId: '',
                driverId: secondGroupDriver?.id || '',
              },
            ],
            serviceJamoneroAssignmentsOverride: [selectedJamoneroAssignment],
          })
          remainingServiceEventGroups += 2
          return
        }

        phaseRequests.push({
          groupId: g.id || null,
          label,
          phaseType: norm(label),
          date: serviceDate,
          endDate: serviceDate,
          startTime: g.startTime || body.startTime,
          endTime: g.endTime || body.endTime,
          totalWorkers: Number(g.workers || 0),
          jamoneroCount: 0,
          numDrivers: Number(g.drivers || 0),
          wantsResp,
          responsableId,
          manualDriverId: g.driverId || null,
          meetingPoint: g.meetingPoint || body.meetingPoint || '',
          groupsOverride: [g],
        })
        if (norm(label) === 'event') remainingServiceEventGroups += 1
      })

      if (existingEventGroupsCount > 1 && serviceAssignments.length > 0) {
        let remainingManualAssignments = serviceAssignments.filter(
          (assignment: any) => assignment?.mode === 'manual' && (assignment?.personnelId || assignment?.personnelName)
        )
        let remainingAutoAssignments = serviceAssignments.filter(
          (assignment: any) => assignment?.mode !== 'manual'
        )

        const crewForPhase = (phase: any) => {
          const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
          if (!group) return null
          const driverId = String(group.driverId || phase.manualDriverId || '').trim()
          if (driverId) return findCrewByDriver({ id: driverId })
          if (
            phase.phaseType === 'event' &&
            body.manualResponsibleId &&
            (!phase.responsableId || String(phase.responsableId).trim() === '') &&
            group?.id === body.groups?.[0]?.id
          ) {
            const topResponsible = findPerson({ id: body.manualResponsibleId })
            if (!topResponsible) return null
            return topResponsible.isDriver
              ? findCrewByDriver({ id: topResponsible.id, name: topResponsible.name })
              : findCrewByCompanion({ id: topResponsible.id, name: topResponsible.name })
          }
          if (phase.responsableId) {
            const responsible = findPerson({ id: phase.responsableId })
            if (!responsible) return null
            return responsible.isDriver
              ? findCrewByDriver({ id: responsible.id, name: responsible.name })
              : findCrewByCompanion({ id: responsible.id, name: responsible.name })
          }
          return null
        }

        const assignmentMatchesCrew = (assignment: any, crew: DriverCrewPremise | null) => {
          if (!assignment || !crew) return false
          const person = findPerson({
            id: assignment.personnelId || null,
            name: assignment.personnelName || null,
          })
          if (!person) return false
          if (person.isDriver) return false
          return crewContainsPerson(crew, { id: person.id, name: person.name })
        }

        const phaseAlreadyRepresentsPerson = (assignment: any) => {
          const person = findPerson({
            id: assignment?.personnelId || null,
            name: assignment?.personnelName || null,
          })
          if (!person) return false

          return phaseRequests.some((phase) => {
            if (phase.phaseType !== 'event') return false
            const group = Array.isArray(phase.groupsOverride) ? phase.groupsOverride[0] : null
            const driverId = String(group?.driverId || phase.manualDriverId || '').trim()
            if (driverId && person.id && driverId === String(person.id)) return true
            const crew = crewForPhase(phase)
            return crewContainsPerson(crew, { id: person.id, name: person.name })
          })
        }

        const createExtraDriverPhase = (assignment: any) => {
          const person = findPerson({
            id: assignment?.personnelId || null,
            name: assignment?.personnelName || null,
          })
          if (!person?.isDriver) return false

          const donorCandidates = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .filter(({ phase }) => Number(phase.totalWorkers || 0) > 1)
            .sort((a, b) => {
              const aIsResponsibleGroup = Boolean(String(a.phase.responsableId || '').trim())
              const bIsResponsibleGroup = Boolean(String(b.phase.responsableId || '').trim())
              if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? 1 : -1
              return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
            })

          const donor = donorCandidates[0]
          if (!donor) return false

          const donorGroup = Array.isArray(donor.phase.groupsOverride) ? donor.phase.groupsOverride[0] : null
          if (!donorGroup) return false

          const nextWorkers = Math.max(Number(donor.phase.totalWorkers || 0) - 1, 1)
          phaseRequests[donor.index] = {
            ...donor.phase,
            totalWorkers: nextWorkers,
            groupsOverride: [
              {
                ...donorGroup,
                workers: nextWorkers,
              },
            ],
          }

          const baseId = String(donor.phase.groupId || donorGroup.id || 'group')
          phaseRequests.push({
            groupId: `${baseId}__extra_${String(person.id || 'driver')}`,
            label: donor.phase.label,
            phaseType: donor.phase.phaseType,
            date: donor.phase.date,
            endDate: donor.phase.endDate,
            startTime: donor.phase.startTime,
            endTime: donor.phase.endTime,
            totalWorkers: 1,
            jamoneroCount: 1,
            numDrivers: 1,
            wantsResp: false,
            responsableId: null,
            manualDriverId: person.id,
            meetingPoint: donor.phase.meetingPoint || body.meetingPoint || '',
            groupsOverride: [
              {
                ...donorGroup,
                id: `${baseId}__extra_${String(person.id || 'driver')}`,
                workers: 1,
                drivers: 1,
                needsDriver: true,
                wantsResponsible: false,
                responsibleId: '',
                driverId: person.id,
              },
            ],
            serviceJamoneroAssignmentsOverride: [assignment],
          })
          remainingServiceEventGroups += 1
          return true
        }

        const driverManualAssignments = remainingManualAssignments.filter((assignment) =>
          Boolean(
              findPerson({
                id: assignment?.personnelId || null,
                name: assignment?.personnelName || null,
              })?.isDriver
            )
          ).filter((assignment) => !phaseAlreadyRepresentsPerson(assignment))
        driverManualAssignments.forEach((assignment) => {
          if (createExtraDriverPhase(assignment)) {
            remainingManualAssignments = remainingManualAssignments.filter((candidate) => candidate !== assignment)
          }
        })

        phaseRequests = phaseRequests.map((phase) => {
          if (phase.phaseType !== 'event') return phase
          const crew = crewForPhase(phase)
          const currentOverrides = Array.isArray(phase.serviceJamoneroAssignmentsOverride)
            ? phase.serviceJamoneroAssignmentsOverride
            : []

          const matchedManual = remainingManualAssignments.find((assignment) =>
            assignmentMatchesCrew(assignment, crew)
          )
          if (matchedManual) {
            remainingManualAssignments = remainingManualAssignments.filter(
              (assignment) => assignment !== matchedManual
            )
            return {
              ...phase,
              serviceJamoneroAssignmentsOverride: [...currentOverrides, matchedManual],
            }
          }

          return {
            ...phase,
            serviceJamoneroAssignmentsOverride: currentOverrides,
          }
        })

        if (remainingManualAssignments.length > 0) {
          const eventPhaseIndexes = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .sort((a, b) => {
              const aHasDriver = Boolean(String(a.phase.manualDriverId || a.phase.groupsOverride?.[0]?.driverId || '').trim())
              const bHasDriver = Boolean(String(b.phase.manualDriverId || b.phase.groupsOverride?.[0]?.driverId || '').trim())
              if (aHasDriver !== bHasDriver) return aHasDriver ? -1 : 1
              const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
                ? a.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
                ? b.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              return aOverrides - bOverrides
            })

          remainingManualAssignments.forEach((assignment, idx) => {
            const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
            if (!target) return
            const current = Array.isArray(phaseRequests[target.index].serviceJamoneroAssignmentsOverride)
              ? phaseRequests[target.index].serviceJamoneroAssignmentsOverride
              : []
            phaseRequests[target.index] = {
              ...phaseRequests[target.index],
              serviceJamoneroAssignmentsOverride: [...current, assignment],
            }
          })
          remainingManualAssignments = []
        }

        if (remainingAutoAssignments.length > 0) {
          const eventPhaseIndexes = phaseRequests
            .map((phase, index) => ({ phase, index }))
            .filter(({ phase }) => phase.phaseType === 'event')
            .sort((a, b) => {
              const aOverrides = Array.isArray(a.phase.serviceJamoneroAssignmentsOverride)
                ? a.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              const bOverrides = Array.isArray(b.phase.serviceJamoneroAssignmentsOverride)
                ? b.phase.serviceJamoneroAssignmentsOverride.length
                : 0
              if (aOverrides !== bOverrides) return aOverrides - bOverrides
              return Number(b.phase.totalWorkers || 0) - Number(a.phase.totalWorkers || 0)
            })

          remainingAutoAssignments.forEach((assignment, idx) => {
            const target = eventPhaseIndexes[idx % Math.max(eventPhaseIndexes.length, 1)]
            if (!target) return
            const current = Array.isArray(phaseRequests[target.index].serviceJamoneroAssignmentsOverride)
              ? phaseRequests[target.index].serviceJamoneroAssignmentsOverride
              : []
            phaseRequests[target.index] = {
              ...phaseRequests[target.index],
              serviceJamoneroAssignmentsOverride: [...current, assignment],
            }
          })
          remainingAutoAssignments = []
        }
      }
    }

    const writePhaseDoc = async (phase: any, blockedNames: string[] = []) => {
      const isPrimaryResponsibleEventGroup =
        deptNorm === 'serveis' &&
        phase.phaseType === 'event' &&
        Boolean(body.manualResponsibleId) &&
        String(phase.groupId || phase.groupsOverride?.[0]?.id || '') ===
          String(body.groups?.[0]?.id || '')
      const phaseServiceJamoneros =
        deptNorm === 'serveis' && phase.phaseType === 'event'
          ? Array.isArray(phase.serviceJamoneroAssignmentsOverride)
            ? phase.serviceJamoneroAssignmentsOverride
            : Array.isArray(phase.partitionedServiceJamoneros)
              ? phase.partitionedServiceJamoneros
              : remainingServiceJamoneroAssignments.slice(
                  0,
                  Math.max(
                    remainingServiceJamoneroAssignments.length -
                      Math.max(remainingServiceEventGroups - 1, 0),
                    remainingServiceJamoneroAssignments.length > 0 ? 1 : 0
                  )
                )
          : []
      const phaseNumDrivers =
        deptNorm === 'serveis' && phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
          ? Math.max(Number(phase.numDrivers || 0), 1)
          : Number(phase.numDrivers || 0)
      const phaseGroupsOverride =
        deptNorm === 'serveis' && Array.isArray(phase.groupsOverride)
          ? phase.groupsOverride.map((group: any) => ({
              ...group,
              drivers:
                phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                  ? Math.max(Number(group.drivers || 0), 1)
                  : Number(group.drivers || 0),
              needsDriver:
                phase.phaseType === 'event' && phaseServiceJamoneros.length > 0
                  ? true
                  : !!group.needsDriver,
            }))
          : phase.groupsOverride
      const phaseTimetables = Array.isArray(phase.timetables)
        ? phase.timetables
        : body.timetables
      const phaseBody = {
        ...body,
        startDate: phase.date || body.startDate,
        endDate: phase.endDate || phase.date || body.endDate,
        startTime: phase.startTime || body.startTime,
        endTime: phase.endTime || body.endTime,
        meetingPoint: phase.meetingPoint || body.meetingPoint || '',
        totalWorkers: Number(phase.totalWorkers || 0),
        jamoneroCount:
          deptNorm === 'serveis' && phase.phaseType === 'event'
            ? phaseServiceJamoneros.length
            : Number(phase.jamoneroCount || 0),
        numDrivers: phaseNumDrivers,
        manualResponsibleId: isPrimaryResponsibleEventGroup
          ? body.manualResponsibleId
          : phase.wantsResp
          ? phase.responsableId || null
          : null,
        manualDriverId: phase.manualDriverId || null,
        skipResponsible: isPrimaryResponsibleEventGroup ? false : phase.wantsResp === false,
        vehicles: Array.isArray(phase.vehicles) ? phase.vehicles : [],
        blockedNames,
        groups: phaseGroupsOverride || body.groups,
        phaseType: phase.phaseType || null,
        phaseLabel: phase.label || null,
        phaseDate: phase.date || null,
        timetables: phaseTimetables,
        serviceJamoneroAssignments: phaseServiceJamoneros,
      }
      const phaseSurveyPreferred = await getSurveyPreferred(
        String(phase.date || body.startDate || '').slice(0, 10)
      )
      const phaseAssignBody = await enrichWithSurveyPreferences(phaseBody, deptNorm, phaseSurveyPreferred)
      const departmentPeople = await getDepartmentPeople()
      const premisesData = await getPremisesData()
      const ledger = await getLedgerForDate(String(phase.date || body.startDate || '').slice(0, 10))
      const phaseKeyForBusy = norm(phase.label || phase.phaseType || 'fase')
      const phaseDateForBusy = String(phase.date || body.startDate)
      const groupKeyForBusy = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
      const phaseDocIdForBusy = `${canonicalEventId}__${phaseKeyForBusy}__${phaseDateForBusy}__${
        groupKeyForBusy || 'group'
      }`
      const res = (await autoAssign({
        ...phaseAssignBody,
        departmentPeople,
        premises: premisesData?.premises,
        premisesWarnings: premisesData?.warnings || [],
        ledger,
        ignoreBusyQuadrantDocIds: [phaseDocIdForBusy],
      })) as {
        assignment: {
          responsible?: { name: string } | null
          drivers?: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
          staff?: Array<{ name: string; meetingPoint?: string }>
        }
        meta: {
          needsReview?: boolean
          violations?: string[]
          notes?: string[]
        }
      }
      if (deptNorm === 'serveis' && phase.phaseType === 'event') {
        consumeServiceJamoneros(res.assignment)
        remainingServiceEventGroups = Math.max(remainingServiceEventGroups - 1, 0)
      }
      const { toSave } = buildToSave(phaseAssignBody, res.assignment, res.meta)
      await applyStageData(toSave)
      const phaseKey = norm(phase.label || phase.phaseType || 'fase')
      const phaseDate = String(phase.date || body.startDate)
      const groupKey = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
      const docId = `${canonicalEventId}__${phaseKey}__${phaseDate}__${groupKey || 'group'}`
      await db.collection(collectionName).doc(docId).set(toSave, { merge: true })
      return res
    }

    if (phaseRequests.length > 0) {
      const blockedNamesInBatch = new Set<string>()
      let preferredResult: {
        assignment?: {
          responsible?: { name: string } | null
          drivers?: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
          staff?: Array<{ name: string; meetingPoint?: string }>
        }
        meta?: {
          needsReview?: boolean
          violations?: string[]
          notes?: string[]
        }
      } | null = null
      const orderedPhaseRequests =
        deptNorm === 'serveis'
          ? [
              ...phaseRequests
                .filter((phase) => phase.phaseType === 'event')
                .sort((a, b) => {
                  const aIsResponsibleGroup =
                    Boolean(String(a.responsableId || '').trim()) ||
                    (Boolean(body.manualResponsibleId) &&
                      String(a.groupId || a.groupsOverride?.[0]?.id || '') ===
                        String(body.groups?.[0]?.id || ''))
                  const bIsResponsibleGroup =
                    Boolean(String(b.responsableId || '').trim()) ||
                    (Boolean(body.manualResponsibleId) &&
                      String(b.groupId || b.groupsOverride?.[0]?.id || '') ===
                        String(body.groups?.[0]?.id || ''))
                  if (aIsResponsibleGroup !== bIsResponsibleGroup) return aIsResponsibleGroup ? -1 : 1

                  const aHasManualDriver = Boolean(String(a.manualDriverId || '').trim())
                  const bHasManualDriver = Boolean(String(b.manualDriverId || '').trim())
                  if (aHasManualDriver !== bHasManualDriver) return aHasManualDriver ? -1 : 1
                  return 0
                }),
              ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
            ]
          : deptNorm === 'logistica'
          ? [
              ...phaseRequests.filter((phase) => phase.phaseType === 'event'),
              ...phaseRequests.filter((phase) => phase.phaseType !== 'event'),
            ]
          : phaseRequests

      if (deptNorm === 'serveis' && orderedPhaseRequests.length > 0) {
        const serveisEventPhasesInOrder = orderedPhaseRequests.filter((p) => p.phaseType === 'event')
        if (
          serveisEventPhasesInOrder.length > 0 &&
          Array.isArray(body.serviceJamoneroAssignments) &&
          body.serviceJamoneroAssignments.length > 0
        ) {
          const normalizedServeisJamoneros = body.serviceJamoneroAssignments.map(
            (assignment: any, index: number) => ({
              id: String(assignment?.id || `jamonero-${index + 1}`),
              mode: assignment?.mode === 'manual' ? ('manual' as const) : ('auto' as const),
              personnelId: assignment?.personnelId ? String(assignment.personnelId) : null,
              personnelName: assignment?.personnelName ? String(assignment.personnelName) : null,
            })
          )
          const jamoneroChunks = partitionAssignmentsAcrossPhases(
            normalizedServeisJamoneros,
            serveisEventPhasesInOrder.length
          )
          serveisEventPhasesInOrder.forEach((phase, idx) => {
            phase.partitionedServiceJamoneros = jamoneroChunks[idx] || []
          })
        }
      }

      for (const phase of orderedPhaseRequests) {
        const result = await writePhaseDoc(phase, Array.from(blockedNamesInBatch))
        if (!preferredResult && phase.phaseType === 'event') {
          preferredResult = result
        }
        if (!preferredResult) {
          preferredResult = result
        }
        const assignedNames = [
          result?.assignment?.responsible?.name || null,
          ...(Array.isArray(result?.assignment?.drivers)
            ? result.assignment.drivers.map((driver: any) => driver?.name || null)
            : []),
          ...(Array.isArray(result?.assignment?.staff)
            ? result.assignment.staff.map((person: any) => person?.name || null)
            : []),
        ]
        assignedNames
          .filter((name): name is string => Boolean(name) && String(name).trim() !== '' && String(name) !== 'Extra')
          .forEach((name) => blockedNamesInBatch.add(String(name)))
      }
      revalidateQuadrantsListCache()
      return NextResponse.json({
        success: true,
        proposal: {
          responsible: preferredResult?.assignment?.responsible || null,
          drivers: preferredResult?.assignment?.drivers || [],
          staff: preferredResult?.assignment?.staff || [],
        },
        meta: preferredResult?.meta || { needsReview: false, violations: [], notes: [] },
      })
    }

    const finalSurveyPreferred = await getSurveyPreferred(
      String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
    )
    const finalAssignBody = await enrichWithSurveyPreferences(assignBody, deptNorm, finalSurveyPreferred)
    const departmentPeople = await getDepartmentPeople()
    const premisesData = await getPremisesData()
    const ledger = await getLedgerForDate(
      String(assignBody.phaseDate || assignBody.startDate || '').slice(0, 10)
    )
    const normEvIdForBusy =
      typeof finalAssignBody.eventId === 'string' && String(finalAssignBody.eventId).trim()
        ? normalizeEventId(String(finalAssignBody.eventId))
        : canonicalEventId
    const singleFlowPhaseDateForBusy = String(
      finalAssignBody.phaseDate || body.phaseDate || finalAssignBody.startDate || ''
    ).trim()
    const shouldIgnoreSelfSingleFlow =
      String(body.generationScope || '').trim().toLowerCase() === 'event' &&
      Boolean(singleFlowPhaseDateForBusy)
    const singleFlowDocIdForBusy = shouldIgnoreSelfSingleFlow
      ? `${normEvIdForBusy}__event__${singleFlowPhaseDateForBusy}__event`
      : normEvIdForBusy
    const res = (await autoAssign({
      ...finalAssignBody,
      departmentPeople,
      premises: premisesData?.premises,
      premisesWarnings: premisesData?.warnings || [],
      ledger,
      ignoreBusyQuadrantDocIds: [singleFlowDocIdForBusy],
    })) as {
      assignment: {
        responsible?: { name: string } | null
        drivers?: Array<{ name: string; meetingPoint?: string; plate?: string; vehicleType?: string }>
        staff?: Array<{ name: string; meetingPoint?: string }>
      }
      meta: {
        needsReview?: boolean
        violations?: string[]
        notes?: string[]
      }
    }

    const { toSave } = buildToSave(finalAssignBody, res.assignment, res.meta)
    await applyStageData(toSave)

    const normalizedEventId =
      typeof toSave.eventId === 'string' && toSave.eventId.trim()
        ? normalizeEventId(toSave.eventId)
        : canonicalEventId
    const singleFlowPhaseDate = String(body.phaseDate || toSave.phaseDate || toSave.startDate || '').trim()
    const shouldPersistSingleFlowPerDay =
      String(body.generationScope || '').trim().toLowerCase() === 'event' &&
      Boolean(singleFlowPhaseDate)
    const docIdForSingleFlow = shouldPersistSingleFlowPerDay
      ? `${normalizedEventId}__event__${singleFlowPhaseDate}__event`
      : normalizedEventId

    await db.collection(collectionName).doc(docIdForSingleFlow).set(toSave, { merge: true })

    revalidateQuadrantsListCache()
    return NextResponse.json({
      success: true,
      proposal: {
        responsible: res.assignment.responsible,
        drivers: res.assignment.drivers,
        staff: res.assignment.staff,
      },
      meta: res.meta,
    })
  } catch (e: unknown) {
    console.error('[quadrants/route] error:', e)
    if (e instanceof Error) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

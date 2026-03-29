// src/app/api/quadrants/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { autoAssign } from '@/services/autoAssign'

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
}

/* ================= Handler ================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const canonicalEventId = normalizeEventId(String(body?.eventId || ''))

    const required = ['eventId', 'department', 'startDate', 'endDate']
    for (const k of required) {
      if (!body?.[k]) {
        return NextResponse.json({ success: false, error: `Missing ${k}` }, { status: 400 })
      }
    }

    const deptNorm = norm(String(body.department || ''))
    const collectionName = await resolveWriteCollectionForDepartment(deptNorm)
    console.log('[quadrants/route] Escriurà a col·lecció:', collectionName)

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
        })),

        treballadors: [
          ...staffClean.map((s) => ({
            name: s.name,
            meetingPoint: s.meetingPoint || bodyForSave.meetingPoint || '',
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
            id: g.id || null,
            serviceDate: g.serviceDate || null,
            dateLabel: g.dateLabel || null,
            meetingPoint: g.meetingPoint || '',
            startTime: g.startTime || '',
            endTime: g.endTime || '',
            workers: Number(g.workers || 0),
            drivers: Number(g.drivers || 0),
            needsDriver: !!g.needsDriver,
            driverId: g.driverId || null,
            driverName:
              g.driverName ||
              assignmentForSave.drivers?.find((driver, idx) =>
                idx < Math.max(1, Number(g.drivers || 0))
              )?.name ||
              null,
            responsibleId: g.responsibleId || bodyForSave.manualResponsibleId || null,
            responsibleName:
              g.responsibleName ||
              bodyForSave.manualResponsibleName ||
              assignmentForSave.responsible?.name ||
              null,
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
                  person.isExternal !== true &&
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

    const phaseRequests: Array<any> = []

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
      body.groups.forEach((g: any) => {
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
        const responsableId =
          wantsResp && (g.responsibleId || body.manualResponsibleId)
            ? g.responsibleId || body.manualResponsibleId
            : null
        phaseRequests.push({
          groupId: g.id || null,
          label,
          phaseType: norm(label),
          date: serviceDate,
          endDate: serviceDate,
          startTime: g.startTime || body.startTime,
          endTime: g.endTime || body.endTime,
          totalWorkers: Number(g.workers || 0),
          numDrivers: Number(g.drivers || 0),
          wantsResp,
          responsableId,
          manualDriverId: g.driverId || null,
          meetingPoint: g.meetingPoint || body.meetingPoint || '',
          groupsOverride: [g],
        })
      })
    }

    const writePhaseDoc = async (phase: any) => {
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
        numDrivers: Number(phase.numDrivers || 0),
        manualResponsibleId: phase.wantsResp ? phase.responsableId || null : null,
        manualDriverId: phase.manualDriverId || null,
        skipResponsible: phase.wantsResp === false,
        vehicles: Array.isArray(phase.vehicles) ? phase.vehicles : [],
        groups: phase.groupsOverride || body.groups,
        phaseType: phase.phaseType || null,
        phaseLabel: phase.label || null,
        phaseDate: phase.date || null,
        timetables: phaseTimetables,
      }
      const res = (await autoAssign(phaseBody)) as {
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
      const { toSave } = buildToSave(phaseBody, res.assignment, res.meta)
      await applyStageData(toSave)
      const phaseKey = norm(phase.label || phase.phaseType || 'fase')
      const phaseDate = String(phase.date || body.startDate)
      const groupKey = String(phase.groupId || phase.groupsOverride?.[0]?.id || 'group')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
      const docId = `${canonicalEventId}__${phaseKey}__${phaseDate}__${groupKey || 'group'}`
      await db.collection(collectionName).doc(docId).set(toSave, { merge: true })
    }

    if (phaseRequests.length > 0) {
      for (const phase of phaseRequests) {
        await writePhaseDoc(phase)
      }
      return NextResponse.json({
        success: true,
        proposal: { responsible: null, drivers: [], staff: [] },
        meta: { needsReview: false, violations: [], notes: [] },
      })
    }

    const res = (await autoAssign(assignBody)) as {
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

    const { toSave } = buildToSave(assignBody, res.assignment, res.meta)
    await applyStageData(toSave)

    const normalizedEventId =
      typeof toSave.eventId === 'string' && toSave.eventId.trim()
        ? normalizeEventId(toSave.eventId)
        : canonicalEventId
    const docIdForSingleFlow = normalizedEventId

    await db.collection(collectionName).doc(docIdForSingleFlow).set(toSave, { merge: true })

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

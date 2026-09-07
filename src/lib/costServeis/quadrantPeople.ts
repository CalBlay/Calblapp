import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { hoursBetween } from '@/lib/costServeis/calc'
import { mapUserDeptToCostDept } from '@/lib/costServeis/access'
import {
  COST_SERVEIS_DEPARTMENTS,
  type CostServeisDepartment,
  type DepartmentCostBlock,
} from '@/lib/costServeis/types'
import {
  normalizeTransportPlateKey,
  normalizeTransportType,
} from '@/lib/transportTypes'

const DEFAULT_COST_VEHICLE_TYPE = 'camioGran'

function resolveCostVehicleType(raw?: string | null): string {
  return normalizeTransportType(String(raw || '').trim()) || DEFAULT_COST_VEHICLE_TYPE
}

const unaccent = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string | null) => unaccent(String(s || '')).toLowerCase().trim()

const normalizeEventId = (value?: string | null) =>
  String(value || '')
    .trim()
    .split('__')[0]
    .trim()

/** Col·leccions de quadrants rellevants per cost de serveis. */
const QUADRANT_COLLECTIONS = [
  'quadrantsLogistica',
  'quadrantsServeis',
  'quadrantsCuina',
] as const

type QuadrantPersonLine = {
  name?: string
  time?: string
  hour?: string
  startTime?: string
  endTime?: string
  endTimeReal?: string
  noShow?: boolean
  plate?: string
  matricula?: string
  vehiclePlate?: string
  vehicleType?: string
  vehicleId?: string
}

type QuadrantVehicleLine = {
  id?: string
  plate?: string
  matricula?: string
  vehiclePlate?: string
  vehicleType?: string
  type?: string
}

type QuadrantDoc = {
  eventId?: string
  department?: string
  startTime?: string
  endTime?: string
  endTimeReal?: string
  hour?: string
  convocatoria?: string
  numDrivers?: number
  timetables?: Array<{ startTime?: string; endTime?: string }>
  vehicles?: QuadrantVehicleLine[]
  responsableName?: string
  responsable?: string | QuadrantPersonLine
  responsables?: Array<string | QuadrantPersonLine>
  conductors?: QuadrantPersonLine[]
  treballadors?: QuadrantPersonLine[]
  workers?: QuadrantPersonLine[]
}

export type CostDeptStaffing = {
  /** Treballadors únics assignats al quadrant del servei */
  peopleCount: number
  /** Vehicles únics utilitzats (matrícules / assignacions del quadrant) */
  vehicleCount: number
  /** Tipus de vehicle per trajecte (ordre del quadrant), per consum combustible */
  vehicleTypes: string[]
  /** Hora d’inici (convocatòria) del quadrant */
  callTime: string
  /**
   * Fi efectiva:
   * 1) tancament (endTimeReal) si s’ha fet
   * 2) hora fi de l’esdeveniment (HoraFi)
   * 3) hora fi prevista del quadrant
   */
  closeTime: string
  /** Hores = callTime → closeTime */
  hours: number
}

function emptyStaffing(): CostDeptStaffing {
  return {
    peopleCount: 0,
    vehicleCount: 0,
    vehicleTypes: [],
    callTime: '',
    closeTime: '',
    hours: 0,
  }
}

function emptyStaffingByDept(): Record<CostServeisDepartment, CostDeptStaffing> {
  return {
    logistica: emptyStaffing(),
    serveis: emptyStaffing(),
    cuina: emptyStaffing(),
  }
}

function emptyCounts(): Record<CostServeisDepartment, number> {
  return { logistica: 0, serveis: 0, cuina: 0 }
}

/** Normalitza a HH:mm (accepta 9:30, 09:30:00, 9.30, ISO, etc.). */
export function normalizeClockTime(raw?: string | number | null): string {
  if (raw == null || raw === '') return ''
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel-like fraction of day, or milliseconds unlikely — treat as ignored
    return ''
  }
  let s = String(raw).trim()
  if (!s) return ''

  // ISO / datetime → clock part
  const iso = s.match(/T(\d{1,2}):(\d{2})/)
  if (iso) s = `${iso[1]}:${iso[2]}`

  s = s.replace(/[hH\.]/g, ':').replace(/\s+/g, '')
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (!m) return ''
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return ''
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function toMinutes(hhmm: string): number | null {
  const t = normalizeClockTime(hhmm)
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function deptFromCollection(coll: string): CostServeisDepartment | null {
  const n = norm(coll)
  if (n.includes('logistica')) return 'logistica'
  if (n.includes('serveis')) return 'serveis'
  if (n.includes('cuina')) return 'cuina'
  return null
}

function resolveDept(doc: QuadrantDoc, coll: string): CostServeisDepartment | null {
  return mapUserDeptToCostDept(doc.department) || deptFromCollection(coll)
}

type DeptAcc = {
  names: Set<string>
  /** Matrícules / ids de vehicle únics */
  vehicleKeys: Set<string>
  /** Tipus per clau de vehicle (matrícula / id) */
  vehicleTypeByKey: Map<string, string>
  /** Tipus sense matrícula/id (slots anònims) */
  orphanVehicleTypes: string[]
  /** Slots a l’array `vehicles` del quadrant */
  vehicleSlots: number
  /** Conductors assignats (cada un implica un vehicle) */
  driverSlots: number
  numDriversHint: number
  startMins: number[]
  realEndMins: number[]
  plannedEndMins: number[]
}

function emptyDeptAcc(): DeptAcc {
  return {
    names: new Set(),
    vehicleKeys: new Set(),
    vehicleTypeByKey: new Map(),
    orphanVehicleTypes: [],
    vehicleSlots: 0,
    driverSlots: 0,
    numDriversHint: 0,
    startMins: [],
    realEndMins: [],
    plannedEndMins: [],
  }
}

function emptyAccByDept(): Record<CostServeisDepartment, DeptAcc> {
  return {
    logistica: emptyDeptAcc(),
    serveis: emptyDeptAcc(),
    cuina: emptyDeptAcc(),
  }
}

function pushStart(acc: DeptAcc, raw?: string | number | null) {
  const mins = toMinutes(normalizeClockTime(raw))
  if (mins != null) acc.startMins.push(mins)
}

function pushRealEnd(acc: DeptAcc, raw?: string | number | null) {
  const mins = toMinutes(normalizeClockTime(raw))
  if (mins != null) acc.realEndMins.push(mins)
}

function pushPlannedEnd(acc: DeptAcc, raw?: string | number | null) {
  const mins = toMinutes(normalizeClockTime(raw))
  if (mins != null) acc.plannedEndMins.push(mins)
}

function pushName(acc: DeptAcc, name: string | undefined | null) {
  const n = String(name || '').trim()
  if (!n) return
  acc.names.add(norm(n))
}

function plateKey(raw?: string | null): string {
  return normalizeTransportPlateKey(raw)
}

function pushVehicleKey(
  acc: DeptAcc,
  opts: {
    plate?: string | null
    vehicleId?: string | null
    vehicleType?: string | null
  }
) {
  const rawType = String(opts.vehicleType || '').trim()
  const type = resolveCostVehicleType(rawType)
  const plate = plateKey(opts.plate)
  if (plate) {
    const key = `p:${plate}`
    acc.vehicleKeys.add(key)
    if (!acc.vehicleTypeByKey.has(key) || rawType) {
      acc.vehicleTypeByKey.set(key, type)
    }
    return
  }
  const id = String(opts.vehicleId || '').trim()
  if (id) {
    const key = `id:${id}`
    acc.vehicleKeys.add(key)
    if (!acc.vehicleTypeByKey.has(key) || rawType) {
      acc.vehicleTypeByKey.set(key, type)
    }
    return
  }
  if (rawType) acc.orphanVehicleTypes.push(type)
}

function collectFromDoc(doc: QuadrantDoc, coll: string, byDept: Record<CostServeisDepartment, DeptAcc>) {
  const dept = resolveDept(doc, coll)
  if (!dept) return
  const acc = byDept[dept]

  const docStart =
    normalizeClockTime(doc.startTime) ||
    normalizeClockTime(doc.hour) ||
    normalizeClockTime(doc.convocatoria)
  const docPlannedEnd = normalizeClockTime(doc.endTime)
  pushStart(acc, docStart)
  pushPlannedEnd(acc, docPlannedEnd)
  pushRealEnd(acc, doc.endTimeReal)

  const numDrivers = Math.max(0, Number(doc.numDrivers) || 0)
  if (numDrivers > acc.numDriversHint) acc.numDriversHint = numDrivers

  if (Array.isArray(doc.timetables)) {
    for (const tt of doc.timetables) {
      pushStart(acc, tt?.startTime)
      pushPlannedEnd(acc, tt?.endTime)
    }
  }

  if (Array.isArray(doc.vehicles)) {
    acc.vehicleSlots += doc.vehicles.length
    for (const v of doc.vehicles) {
      if (!v || typeof v !== 'object') continue
      pushVehicleKey(acc, {
        plate: v.plate || v.matricula || v.vehiclePlate,
        vehicleId: v.id,
        vehicleType: v.vehicleType || v.type,
      })
    }
  }

  const addPerson = (p: QuadrantPersonLine | string | null | undefined, asDriver = false) => {
    if (!p) return
    if (typeof p === 'string') {
      pushName(acc, p)
      pushStart(acc, docStart)
      pushPlannedEnd(acc, docPlannedEnd)
      if (asDriver) acc.driverSlots += 1
      return
    }
    if (p.noShow) return
    pushName(acc, p.name)
    const start =
      normalizeClockTime(p.startTime) ||
      normalizeClockTime(p.time) ||
      normalizeClockTime(p.hour) ||
      docStart
    pushStart(acc, start)
    pushPlannedEnd(acc, normalizeClockTime(p.endTime) || docPlannedEnd)
    pushRealEnd(acc, p.endTimeReal)
    if (asDriver) {
      acc.driverSlots += 1
      pushVehicleKey(acc, {
        plate: p.plate || p.matricula || p.vehiclePlate,
        vehicleId: p.vehicleId,
        vehicleType: p.vehicleType,
      })
    }
  }

  if (doc.responsableName) {
    pushName(acc, doc.responsableName)
    pushStart(acc, docStart)
    pushPlannedEnd(acc, docPlannedEnd)
  }
  addPerson(doc.responsable)
  ;(Array.isArray(doc.responsables) ? doc.responsables : []).forEach((p) => addPerson(p))
  ;(Array.isArray(doc.conductors) ? doc.conductors : []).forEach((p) => addPerson(p, true))
  ;(Array.isArray(doc.treballadors) ? doc.treballadors : []).forEach((p) => addPerson(p))
  ;(Array.isArray(doc.workers) ? doc.workers : []).forEach((p) => addPerson(p))
}

function finalizeStaffing(
  byDept: Record<CostServeisDepartment, DeptAcc>,
  eventEndTime: string,
  eventStartTime = ''
): Record<CostServeisDepartment, CostDeptStaffing> {
  const eventEnd = normalizeClockTime(eventEndTime)
  const eventStart = normalizeClockTime(eventStartTime)
  const out = emptyStaffingByDept()

  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    const acc = byDept[dept]
    const peopleCount = acc.names.size
    let callTime =
      acc.startMins.length > 0
        ? fromMinutes(Math.min(...acc.startMins))
        : eventStart

    // Fi: 1) tancament real  2) hora fi event  3) hora fi prevista del quadrant
    let closeTime =
      acc.realEndMins.length > 0
        ? fromMinutes(Math.max(...acc.realEndMins))
        : eventEnd ||
          (acc.plannedEndMins.length > 0
            ? fromMinutes(Math.max(...acc.plannedEndMins))
            : '')

    // Evita el placeholder 00:00–00:00 dels quadrants sense horari real
    if (callTime === '00:00' && (closeTime === '00:00' || !closeTime)) {
      callTime = eventStart || callTime
      closeTime = eventEnd || (closeTime === '00:00' ? '' : closeTime)
      if (callTime === '00:00' && !eventStart) callTime = ''
    }

    const hours =
      callTime && closeTime ? hoursBetween(callTime, closeTime) : 0

    const vehicleCount = Math.max(
      acc.vehicleKeys.size,
      acc.vehicleSlots,
      acc.driverSlots,
      acc.numDriversHint
    )

    const vehicleTypes: string[] = []
    for (const key of acc.vehicleKeys) {
      vehicleTypes.push(acc.vehicleTypeByKey.get(key) || DEFAULT_COST_VEHICLE_TYPE)
    }
    for (const t of acc.orphanVehicleTypes) {
      if (vehicleTypes.length >= vehicleCount) break
      vehicleTypes.push(t)
    }
    while (vehicleTypes.length < vehicleCount) {
      vehicleTypes.push(DEFAULT_COST_VEHICLE_TYPE)
    }

    out[dept] = {
      peopleCount,
      vehicleCount,
      vehicleTypes,
      callTime,
      closeTime,
      hours,
    }
  }

  return out
}

function accumulateSnaps(
  snaps: Array<{ empty: boolean; forEach: (cb: (doc: { data: () => unknown }) => void) => void } | null>,
  byDeptByEvent: Map<string, Record<CostServeisDepartment, DeptAcc>>,
  onlyEventId?: string
) {
  snaps.forEach((snap, i) => {
    if (!snap || snap.empty) return
    const coll = QUADRANT_COLLECTIONS[i]
    snap.forEach((docSnap) => {
      const data = docSnap.data() as QuadrantDoc
      const eventId = normalizeEventId(data.eventId)
      if (!eventId) return
      if (onlyEventId && eventId !== onlyEventId) return

      let byDept = byDeptByEvent.get(eventId)
      if (!byDept) {
        byDept = emptyAccByDept()
        byDeptByEvent.set(eventId, byDept)
      }
      collectFromDoc(data, coll, byDept)
    })
  })
}

/**
 * Personal + hores des dels quadrants d’un event.
 * Hores: inici quadrant → tancament (endTimeReal) o HoraFi event o fi prevista del quadrant.
 */
export async function staffingByCostDeptForEvent(
  eventId: string,
  eventEndTime: string,
  eventStartTime = ''
): Promise<Record<CostServeisDepartment, CostDeptStaffing>> {
  const id = normalizeEventId(eventId)
  if (!id) return emptyStaffingByDept()

  const snaps = await Promise.all(
    QUADRANT_COLLECTIONS.map((coll) =>
      db
        .collection(coll)
        .where('eventId', '==', id)
        .get()
        .catch(() => null)
    )
  )

  const byDeptByEvent = new Map<string, Record<CostServeisDepartment, DeptAcc>>()
  accumulateSnaps(snaps, byDeptByEvent, id)

  // També mira docs amb id prefix `${eventId}__` (fases)
  if (!byDeptByEvent.has(id)) {
    const prefixSnaps = await Promise.all(
      QUADRANT_COLLECTIONS.map((coll) =>
        db
          .collection(coll)
          .where('eventId', '>=', id)
          .where('eventId', '<=', `${id}\uf8ff`)
          .get()
          .catch(() => null)
      )
    )
    accumulateSnaps(prefixSnaps, byDeptByEvent)
  }

  const byDept = byDeptByEvent.get(id) || emptyAccByDept()
  return finalizeStaffing(byDept, eventEndTime, eventStartTime)
}

/** @deprecated use staffingByCostDeptForEvent */
export async function countQuadrantPeopleByCostDept(
  eventId: string
): Promise<Record<CostServeisDepartment, number>> {
  const staffing = await staffingByCostDeptForEvent(eventId, '')
  const counts = emptyCounts()
  for (const dept of COST_SERVEIS_DEPARTMENTS) counts[dept] = staffing[dept].peopleCount
  return counts
}

/**
 * Staffing per molts events (llista).
 * `eventEndById` / `eventStartById`: HoraFi / HoraInici de cada esdeveniment.
 */
export async function staffingByCostDeptInDateRange(
  fromDay: string,
  toDay: string,
  eventIds: string[],
  eventEndById: Map<string, string>,
  eventStartById: Map<string, string> = new Map()
): Promise<Map<string, Record<CostServeisDepartment, CostDeptStaffing>>> {
  const wanted = new Set(eventIds.map(normalizeEventId).filter(Boolean))
  const result = new Map<string, Record<CostServeisDepartment, CostDeptStaffing>>()
  for (const id of wanted) {
    result.set(id, emptyStaffingByDept())
  }

  if (!wanted.size || !fromDay || !toDay) return result

  const snaps = await Promise.all(
    QUADRANT_COLLECTIONS.map((coll) =>
      db
        .collection(coll)
        .where('startDate', '>=', fromDay)
        .where('startDate', '<=', toDay)
        .get()
        .catch(() => null)
    )
  )

  const byDeptByEvent = new Map<string, Record<CostServeisDepartment, DeptAcc>>()
  accumulateSnaps(snaps, byDeptByEvent)

  for (const id of wanted) {
    const byDept = byDeptByEvent.get(id)
    if (byDept) {
      result.set(
        id,
        finalizeStaffing(
          byDept,
          eventEndById.get(id) || '',
          eventStartById.get(id) || ''
        )
      )
    }
  }

  // Fallback per eventId en lots (si la query per startDate no ha omplert hores)
  const missing = [...wanted].filter((id) => {
    const s = result.get(id)
    if (!s) return true
    return COST_SERVEIS_DEPARTMENTS.every((d) => !s[d].callTime && s[d].hours <= 0)
  })

  const chunkSize = 15
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map(async (id) => {
        const staffing = await staffingByCostDeptForEvent(
          id,
          eventEndById.get(id) || '',
          eventStartById.get(id) || ''
        )
        result.set(id, staffing)
      })
    )
  }

  return result
}

/** @deprecated use staffingByCostDeptInDateRange */
export async function countQuadrantPeopleByCostDeptInDateRange(
  fromDay: string,
  toDay: string,
  eventIds: string[]
): Promise<Map<string, Record<CostServeisDepartment, number>>> {
  const staffingMap = await staffingByCostDeptInDateRange(fromDay, toDay, eventIds, new Map())
  const out = new Map<string, Record<CostServeisDepartment, number>>()
  for (const [id, staffing] of staffingMap) {
    const counts = emptyCounts()
    for (const dept of COST_SERVEIS_DEPARTMENTS) counts[dept] = staffing[dept].peopleCount
    out.set(id, counts)
  }
  return out
}

/** Aplica personal + horari de quadrants als blocs de departament. */
export function applyQuadrantStaffing<
  T extends { departments: Record<CostServeisDepartment, DepartmentCostBlock> },
>(sheet: T, staffing: Record<CostServeisDepartment, CostDeptStaffing>): T {
  const departments = { ...sheet.departments }
  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    const s = staffing[dept] || emptyStaffing()
    departments[dept] = {
      ...departments[dept],
      peopleCount: s.peopleCount,
      callTime: s.callTime,
      closeTime: s.closeTime,
      hours: s.hours,
      hoursManual: false,
    }
  }
  return { ...sheet, departments }
}

/** @deprecated use applyQuadrantStaffing */
export function applyQuadrantPeopleCounts<
  T extends {
    departments: Record<
      CostServeisDepartment,
      { peopleCount: number } & Record<string, unknown>
    >
  },
>(sheet: T, counts: Record<CostServeisDepartment, number>): T {
  const departments = { ...sheet.departments }
  for (const dept of COST_SERVEIS_DEPARTMENTS) {
    departments[dept] = {
      ...departments[dept],
      peopleCount: counts[dept] || 0,
    }
  }
  return { ...sheet, departments }
}

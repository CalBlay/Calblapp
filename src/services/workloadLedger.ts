// filename: src/services/workloadLedger.ts
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export interface BusyAssignment {
  id: string
  status?: string
  department?: string
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  treballadors?: Array<{ name: string }>
  conductors?: Array<{ name: string }>
  responsable?: { name?: string }
  responsableName?: string | null
  responsables?: Array<{ name?: string }>
  groups?: Array<{ responsibleName?: string | null }>
  phaseDate?: string
}

export type Ledger = {
  weeklyHoursByUser: Map<string, number>
  monthlyHoursByUser: Map<string, number>
  assignmentsCountByUser: Map<string, number>
  lastAssignedAtByUser: Map<string, string | null>
  busyAssignments: BusyAssignment[]
}

const QUADRANT_COLLECTIONS = [
  'quadrantsServeis',
  'quadrantsCuina',
  'quadrantsLogistica',
]

const unaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = (s?: string) => unaccent((s || '').toLowerCase().trim())
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const collForDept = (d: string) => `quadrants${capitalize(norm(d))}`

const toHrs = (s?: string, t?: string, eS?: string, eT?: string) => {
  const start = s ? new Date(`${s}T${t || '00:00'}:00`) : null
  const end = eS ? new Date(`${eS}T${eT || '00:00'}:00`) : null
  if (!start || !end) return 0
  const ms = end.getTime() - start.getTime()
  return ms > 0 ? ms / 36e5 : 0
}

const shiftIsoDate = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const getRangeStart = (item: Partial<BusyAssignment>) =>
  String(item.startDate || item.phaseDate || '').trim()

const getRangeEnd = (item: Partial<BusyAssignment>) =>
  String(item.endDate || item.phaseDate || item.startDate || '').trim()

const overlapsDateWindow = (
  item: Partial<BusyAssignment>,
  startISO: string,
  endISO: string
) => {
  const itemStart = getRangeStart(item)
  const itemEnd = getRangeEnd(item)
  if (!itemStart || !itemEnd) return false
  return itemStart <= endISO && itemEnd >= startISO
}

async function queryWindowedDocs(
  collectionId: string,
  startISO: string,
  endISO: string
): Promise<BusyAssignment[]> {
  const ref = db.collection(collectionId)
  const docs = new Map<string, BusyAssignment>()

  try {
    const [startSnap, phaseSnap] = await Promise.all([
      ref.where('startDate', '>=', startISO).where('startDate', '<=', endISO).get(),
      ref.where('phaseDate', '>=', startISO).where('phaseDate', '<=', endISO).get(),
    ])

    startSnap.docs.forEach((doc) => {
      docs.set(doc.id, { id: doc.id, ...(doc.data() as Omit<BusyAssignment, 'id'>) })
    })
    phaseSnap.docs.forEach((doc) => {
      docs.set(doc.id, { id: doc.id, ...(doc.data() as Omit<BusyAssignment, 'id'>) })
    })

    if (docs.size > 0) {
      return Array.from(docs.values()).filter((item) =>
        overlapsDateWindow(item, startISO, endISO)
      )
    }
  } catch (error) {
    console.warn(`[buildLedger] Fallback a lectura completa de ${collectionId}:`, error)
  }

  const fallbackSnap = await ref.get()
  fallbackSnap.docs.forEach((doc) => {
    docs.set(doc.id, { id: doc.id, ...(doc.data() as Omit<BusyAssignment, 'id'>) })
  })
  return Array.from(docs.values()).filter((item) =>
    overlapsDateWindow(item, startISO, endISO)
  )
}

export async function buildLedger(
  department: string,
  weekStartISO: string,
  weekEndISO: string,
  monthStartISO: string,
  monthEndISO: string,
  options?: { includeAllDepartmentsForBusy?: boolean }
): Promise<Ledger> {
  const weeklyHoursByUser = new Map<string, number>()
  const monthlyHoursByUser = new Map<string, number>()
  const assignmentsCountByUser = new Map<string, number>()
  const lastAssignedAtByUser = new Map<string, string | null>()

  const deptCollection = collForDept(department)
  const statsDocs = await queryWindowedDocs(deptCollection, monthStartISO, monthEndISO)

  let busyAssignments: BusyAssignment[] = statsDocs
  if (options?.includeAllDepartmentsForBusy) {
    const busyWindowStart = shiftIsoDate(weekStartISO, -1)
    const allCollections = Array.from(
      new Set([...QUADRANT_COLLECTIONS, deptCollection])
    )

    const results = await Promise.all(
      allCollections.map((collectionId) =>
        queryWindowedDocs(collectionId, busyWindowStart, monthEndISO).catch((error) => {
          console.error(`[buildLedger] Error accedint a la col·lecció ${collectionId}:`, error)
          return [] as BusyAssignment[]
        })
      )
    )

    busyAssignments = results.flat()
  }

  const add = (m: Map<string, number>, key: string, v: number) =>
    m.set(key, (m.get(key) || 0) + v)

  const addCount = (m: Map<string, number>, key: string) =>
    m.set(key, (m.get(key) || 0) + 1)

  const setLast = (m: Map<string, string | null>, key: string, dt: string) => {
    const prev = m.get(key)
    if (!prev || new Date(prev) < new Date(dt)) m.set(key, dt)
  }

  for (const q of statsDocs) {
    if (!['draft', 'confirmed'].includes(String(q.status || 'draft'))) continue
    if (norm(q.department) !== norm(department)) continue

    const baseDate = getRangeStart(q)
    if (!baseDate) continue

    const startISO = `${baseDate}T${q.startTime || '00:00'}:00`
    const hrs = toHrs(baseDate, q.startTime, getRangeEnd(q), q.endTime)

    const persons = [
      ...(Array.isArray(q.treballadors) ? q.treballadors.map((x) => x?.name).filter(Boolean) : []),
      ...(Array.isArray(q.conductors) ? q.conductors.map((x) => x?.name).filter(Boolean) : []),
      ...(Array.isArray(q.responsables)
        ? q.responsables.map((x) => x?.name).filter(Boolean)
        : []),
      ...(q.responsable?.name ? [q.responsable.name] : []),
    ].filter((name): name is string => typeof name === 'string' && Boolean(name))

    for (const name of persons) {
      if (startISO >= `${weekStartISO}T00:00:00` && startISO < `${weekEndISO}T23:59:59`) {
        add(weeklyHoursByUser, name, hrs)
        addCount(assignmentsCountByUser, name)
      }
      if (startISO >= `${monthStartISO}T00:00:00` && startISO < `${monthEndISO}T23:59:59`) {
        add(monthlyHoursByUser, name, hrs)
      }
      setLast(lastAssignedAtByUser, name, startISO)
    }
  }

  return {
    weeklyHoursByUser,
    monthlyHoursByUser,
    assignmentsCountByUser,
    lastAssignedAtByUser,
    busyAssignments,
  }
}

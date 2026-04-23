// filename: src/services/tornsService.ts

import { normalizeTornWorker, type NormalizedWorker } from '@/utils/normalizeTornWorker'

export type Torn = {
  id: string
  code?: string
  eventId: string
  eventName: string
  date: string
  dayNote?: string
  phaseLabel?: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  arrivalTime?: string
  meetingPoint?: string
  location?: string
  department: string
  // Workers normalitzats
  __rawWorkers?: NormalizedWorker[]
  // Camps que omplim quan filtrem per treballador
  workerName?: string
  workerRole?: string | null
  vestimentModel?: string
}

// Tipus genèric per documents de Firestore
export type FirestoreData = Record<string, unknown>

export interface RawWorker {
  id?: string
  workerId?: string
  uid?: string
  email?: string
  name?: string
  nom?: string
  displayName?: string
  startTime?: string
  endTime?: string
  meetingPoint?: string
  department?: string
  plate?: string
  matricula?: string
  vehiclePlate?: string
  vehicleType?: string
}

// ───────────────── Helpers bàsics ─────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseAnyDateToISO(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v)
    return isNaN(d.getTime()) ? '' : toISODate(d)
  }
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : toISODate(v)
  }
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return toISODate((v as { toDate: () => Date }).toDate())
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : toISODate(d)
}

function norm(s?: string | null): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function pad2(n: number | string): string {
  return String(n).padStart(2, '0')
}

function toTimeHHmm(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'number' && Number.isFinite(v)) {
    return `${pad2(Math.floor(v / 60))}:${pad2(Number(v) % 60)}`
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`
  }
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    const d = (v as { toDate: () => Date }).toDate()
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  const str = String(v)
  if (/^\d{2}:\d{2}$/.test(str)) return str
  if (/^\d{4}$/.test(str)) return `${str.slice(0, 2)}:${str.slice(2)}`
  const d = new Date(str)
  return isNaN(d.getTime())
    ? ''
    : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function isISODate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function rangesOverlap(
  aStartISO: string,
  aEndISO: string,
  bStartISO: string,
  bEndISO: string
): boolean {
  if (!isISODate(aStartISO) || !isISODate(aEndISO) || !isISODate(bStartISO) || !isISODate(bEndISO))
    return false
  let aStart = new Date(`${aStartISO}T00:00:00`)
  let aEnd = new Date(`${aEndISO}T23:59:59`)
  let bStart = new Date(`${bStartISO}T00:00:00`)
  let bEnd = new Date(`${bEndISO}T23:59:59`)
  if (aStart > aEnd) [aStart, aEnd] = [aEnd, aStart]
  if (bStart > bEnd) [bStart, bEnd] = [bEnd, bStart]
  return aStart <= bEnd && bStart <= aEnd
}

// ───────────────── Mapping Firestore → Torn ─────────────────

type TornDoc = {
  eventId?: string
  code?: string
  eventName?: string
  summary?: string
  phaseLabel?: string
  phaseType?: string
  date?: string
  startDate?: string | { toDate: () => Date }
  endDate?: string | { toDate: () => Date }
  startTime?: string | number | Date | { toDate: () => Date }
  endTime?: string | number | Date | { toDate: () => Date }
  arrivalTime?: string | number | Date | { toDate: () => Date }
  meetingPoint?: string
  department?: string
  location?: string
  treballadors?: RawWorker[]
  conductors?: RawWorker[]
  responsable?: RawWorker
  responsableId?: string
  responsableName?: string
  groups?: Array<{
    serviceDate?: string
    meetingPoint?: string
    startTime?: string
    endTime?: string
    dateLabel?: string
  }>
  status?: string
  estat?: string
  confirmedAt?: unknown
  confirmada?: unknown
  confirmed?: unknown
  vestimentModel?: string
}

function isConfirmed(data: FirestoreData): boolean {
  const st = String(data.status ?? data.estat ?? '')
    .toLowerCase()
    .trim()
  const hasMark = !!(data.confirmedAt ?? data.confirmada ?? data.confirmed)
  return (
    st === 'confirmed' ||
    st === 'confirmada' ||
    st === 'confirmat' ||
    st === 'ok' ||
    hasMark
  )
}

function mapDocToTorn(
  id: string,
  d: FirestoreData,
  fallbackDept: string | null
): Torn {
  const doc = d as TornDoc

  const eventId = String(doc?.eventId ?? doc?.code ?? '')
  const eventName = String(doc?.eventName ?? doc?.summary ?? '')
  const phaseLabel = String(doc?.phaseLabel ?? doc?.phaseType ?? '').trim() || undefined
  const startDate = parseAnyDateToISO(doc?.startDate ?? doc?.date)
  const endDate = doc?.endDate ? parseAnyDateToISO(doc.endDate) : ''
  const startTime = toTimeHHmm(doc?.startTime)
  const endTime = toTimeHHmm(doc?.endTime)
  const arrivalTime = toTimeHHmm(doc.arrivalTime)
  const meetingPoint = doc?.meetingPoint ?? ''
  const department = doc?.department
    ? norm(doc.department)
    : fallbackDept
    ? norm(fallbackDept)
    : 'sense departament'
  const location = doc?.location ? String(doc.location) : undefined
  const vestimentModelRaw = String(doc.vestimentModel ?? '').trim()
  const vestimentModel = vestimentModelRaw || undefined

  const arrTreballadors = Array.isArray(doc?.treballadors) ? doc.treballadors : []
  const arrConductors = Array.isArray(doc?.conductors) ? doc.conductors : []
  const responsableObj =
    doc?.responsable ??
    ((doc?.responsableName || doc?.responsableId)
      ? { id: doc.responsableId as string, name: doc.responsableName as string }
      : undefined)

  const unified: NormalizedWorker[] = []

  for (const w of arrTreballadors) {
    const nw = normalizeTornWorker({
      ...w,
      role: 'treballador',
      startTime: w.startTime ?? doc.startTime,
      endTime: w.endTime ?? doc.endTime,
      meetingPoint: w.meetingPoint ?? meetingPoint,
      department,
    })
    unified.push(nw)
  }

  for (const w of arrConductors) {
    const nw = normalizeTornWorker({
      ...w,
      role: 'conductor',
      startTime: w.startTime ?? doc.startTime,
      endTime: w.endTime ?? doc.endTime,
      meetingPoint: w.meetingPoint ?? meetingPoint,
      department,
    })
    unified.push(nw)
  }

  if (responsableObj) {
    const ro = responsableObj as RawWorker
    const nw = normalizeTornWorker({
      ...responsableObj,
      role: 'responsable',
      startTime: ro.startTime ?? doc.startTime,
      endTime: ro.endTime ?? doc.endTime,
      meetingPoint: ro.meetingPoint ?? meetingPoint,
      department,
    })
    unified.push(nw)
  }

  return {
    id: String(id || ''),
    code: doc?.code ? String(doc.code) : undefined,
    eventId,
    eventName,
    date: startDate || endDate || '',
    dayNote: phaseLabel || undefined,
    startDate,
    endDate: endDate || startDate,
    startTime,
    endTime,
    arrivalTime,
    meetingPoint,
    location,
    department,
    phaseLabel,
    vestimentModel,
    __rawWorkers: unified,
  }
}

// ───────────────── Fetchs Firestore ─────────────────

const KNOWN_DEPARTMENTS = ['logistica', 'serveis', 'cuina']
const ASSIGNMENT_COLLECTION = 'transportAssignmentsV2'
const ACTIVE_ASSIGNMENT_STATUSES = new Set(['pending', 'confirmed', 'addedToTorns'])

function dayKeyRange(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const start = new Date(`${startISO}T00:00:00`)
  const end = new Date(`${endISO}T00:00:00`)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return out
  if (end < start) return out

  const cur = new Date(start)
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

async function fetchDeptCollectionRange(
  db: FirebaseFirestore.Firestore,
  dep: string,
  startISO: string,
  endISO: string,
  out: Torn[]
) {
  const cap = dep.charAt(0).toUpperCase() + dep.slice(1)
  const collName = `quadrants${cap}`

  let snap: FirebaseFirestore.QuerySnapshot
  try {
    snap = await db
      .collection(collName)
      .where('status', '==', 'confirmed')
      .where('startDate', '>=', startISO)
      .where('startDate', '<=', endISO)
      .get()
  } catch {
    snap = await db.collection(collName).get()
  }

  snap.forEach((doc) => {
    const data = doc.data() as FirestoreData
    if (!isConfirmed(data)) return

    const t = mapDocToTorn(doc.id, data, dep)
    if (!t.startDate && !t.endDate) return

    if (dep === 'serveis') {
      const tornDoc = data as TornDoc
      const groups = Array.isArray(tornDoc.groups) ? tornDoc.groups : []
      const seen = new Set<string>()
      let pushed = false

      for (const g of groups) {
        const gDate = parseAnyDateToISO(g?.serviceDate)
        if (!gDate) continue
        const gStart = toTimeHHmm(g?.startTime)
        const gEnd = toTimeHHmm(g?.endTime)
        const gMeeting = g?.meetingPoint || t.meetingPoint || ''
        const key = `${gDate}|${gStart}|${gEnd}|${gMeeting}`
        if (seen.has(key)) continue
        seen.add(key)

        if (!rangesOverlap(gDate, gDate, startISO, endISO)) continue
        const groupWorkers = Array.isArray(t.__rawWorkers)
          ? t.__rawWorkers.map((w) => ({
              ...w,
              startTime: gStart || w.startTime,
              endTime: gEnd || w.endTime,
              meetingPoint: gMeeting || w.meetingPoint,
            }))
          : t.__rawWorkers

        out.push({
          ...t,
          date: gDate,
          dayNote: String(g?.dateLabel || '').trim() || undefined,
          startDate: gDate,
          endDate: gDate,
          startTime: gStart,
          endTime: gEnd,
          meetingPoint: gMeeting,
          __rawWorkers: groupWorkers,
        })
        pushed = true
      }

      if (pushed) return
    }

    if (rangesOverlap(t.startDate || t.endDate, t.endDate || t.startDate, startISO, endISO)) {
      const cur = new Date(t.startDate)
      const realEnd = new Date(t.endDate)
      while (cur <= realEnd) {
        const iso = toISODate(cur)
        out.push({ ...t, date: iso })
        cur.setDate(cur.getDate() + 1)
      }
    }
  })
}

async function fetchTransportAssignmentsRange(
  db: FirebaseFirestore.Firestore,
  startISO: string,
  endISO: string,
  out: Torn[],
  deptFilter?: string | null
) {
  const dayKeys = dayKeyRange(startISO, endISO)
  if (!dayKeys.length) return

  let docs: FirebaseFirestore.QueryDocumentSnapshot[] = []
  try {
    const chunks: string[][] = []
    for (let i = 0; i < dayKeys.length; i += 10) {
      chunks.push(dayKeys.slice(i, i + 10))
    }
    for (const chunk of chunks) {
      const snap = await db
        .collection(ASSIGNMENT_COLLECTION)
        .where('dayKeys', 'array-contains-any', chunk)
        .get()
      docs.push(...snap.docs)
    }
  } catch {
    const snap = await db.collection(ASSIGNMENT_COLLECTION).get()
    docs = snap.docs
  }

  for (const doc of docs) {
    const data = doc.data() as FirestoreData
    const status = String(data?.status || 'pending')
    if (!ACTIVE_ASSIGNMENT_STATUSES.has(status)) continue

    const department = norm(String(data?.department ?? 'logistica'))
    if (deptFilter && norm(deptFilter) !== department) continue

    const startDate = parseAnyDateToISO(data?.startDate)
    const endDate = parseAnyDateToISO(data?.endDate || data?.startDate)
    if (!startDate) continue
    const realEnd = endDate || startDate

    if (!rangesOverlap(startDate, realEnd, startISO, endISO)) continue

    const eventName = data?.destination
      ? `Transport - ${String(data.destination)}`
      : `Transport ${String(data?.plate || '').trim()}`

    const worker = normalizeTornWorker({
      id: data?.conductorId,
      name: data?.conductorName,
      role: 'conductor',
      startTime: data?.startTime,
      endTime: data?.endTime,
      department,
    })

    const base: Torn = {
      id: `assign:${doc.id}`,
      eventId: '',
      eventName,
      date: startDate,
      startDate,
      endDate: realEnd,
      startTime: toTimeHHmm(data?.startTime),
      endTime: toTimeHHmm(data?.endTime),
      arrivalTime: '',
      meetingPoint: '',
      location: data?.destination ? String(data.destination) : undefined,
      department,
      __rawWorkers: [worker],
    }

    const cur = new Date(startDate)
    const endLoop = new Date(realEnd)
    while (cur <= endLoop) {
      const iso = toISODate(cur)
      out.push({ ...base, date: iso })
      cur.setDate(cur.getDate() + 1)
    }
  }
}

export async function fetchAllTorns(
  startISO: string,
  endISO: string,
  role: 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador',
  department?: string | null,
  workerName?: string
): Promise<Torn[]> {
  const dep = department ? norm(department) : null
  console.log('[fetchAllTorns] range', { startISO, endISO, role, department })

  try {
    const { getFirestore } = await import('firebase-admin/firestore')
    const admin = await import('firebase-admin')
    if (admin.apps.length === 0) admin.initializeApp({})
    const db = getFirestore()

    const out: Torn[] = []

    // Treballador
    if (role === 'Treballador') {
      if (dep) {
        await fetchDeptCollectionRange(db, dep, startISO, endISO, out)
        await fetchTransportAssignmentsRange(db, startISO, endISO, out, dep)
        return out.filter((t) => {
          if (!Array.isArray(t.__rawWorkers)) return false
          const matchWorker = t.__rawWorkers.find(
            (w) => norm(w.name) === norm(workerName)
          )
          if (matchWorker) {
            t.workerName = matchWorker.name
            t.workerRole = matchWorker.role
            t.startTime = matchWorker.startTime || t.startTime
            t.endTime = matchWorker.endTime || t.endTime
            t.meetingPoint = matchWorker.meetingPoint || t.meetingPoint
            return true
          }
          return false
        })
      }
      return []
    }

    // Cap Departament
    if (role === 'Cap Departament') {
      if (dep) {
        await fetchDeptCollectionRange(db, dep, startISO, endISO, out)
        await fetchTransportAssignmentsRange(db, startISO, endISO, out, dep)
        return out
      }
      return []
    }

    // Admin / Direcció
    if (role === 'Admin' || role === 'Direcció') {
      if (dep) {
        await fetchDeptCollectionRange(db, dep, startISO, endISO, out)
      } else {
        for (const d of KNOWN_DEPARTMENTS) {
          await fetchDeptCollectionRange(db, d, startISO, endISO, out)
        }
      }

      const collRef = db.collection('quadrants')
      const snap2 = await collRef
        .where('status', '==', 'confirmed')
        .where('startDate', '>=', startISO)
        .where('startDate', '<=', endISO)
        .get()

      snap2.forEach((doc) => {
        const data = doc.data() as FirestoreData
        if (!isConfirmed(data)) return
        const t = mapDocToTorn(doc.id, data, dep)
        if (!t.startDate && !t.endDate) return

        if (rangesOverlap(t.startDate || t.endDate, t.endDate || t.startDate, startISO, endISO)) {
          const cur = new Date(t.startDate)
          const realEnd = new Date(t.endDate)
          while (cur <= realEnd) {
            const iso = toISODate(cur)
            out.push({ ...t, date: iso })
            cur.setDate(cur.getDate() + 1)
          }
        }
      })

      return out
    }

    return []
  } catch (e) {
    console.error('[tornsService] Firestore error:', e)
    return []
  }
}

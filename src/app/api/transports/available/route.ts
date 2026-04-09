// src/app/api/transports/available/route.ts
import { NextResponse } from 'next/server'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  orderedDayRangeFromISOStrings,
  queryQuadrantCollectionDocsInDateRange,
} from '@/lib/firestoreQuadrantsRangeQuery'
import { normalizeTransportPlateKey } from '@/lib/transportTypes'

export const runtime = 'nodejs'

/* =========================
   HELPERS
========================= */
const toDateTime = (date: string, time?: string) =>
  new Date(`${date}T${time || '00:00'}:00`)

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd

const dayKeyRange = (startISO: string, endISO: string) => {
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

/* =========================
   TYPES
========================= */
type Vehicle = {
  id: string
  plate: string
  type: string
}

type Occupation = {
  plate: string
  start: Date
  end: Date
}

type QuadrantConductorRecord = {
  plate?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  arrivalTime?: string
}

type QuadrantRecord = Record<string, unknown> & {
  conductors?: QuadrantConductorRecord[]
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  arrivalTime?: string
}

const trimStr = (v?: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * Mateixa idea que GET assignacions: sortida / arribada / tornada efectives per fila + quadrant.
 * El vehicle ha d’estar bloquejat des de la sortida fins la tornada; si falta sortida però hi ha arribada, usem arribada (cas habitual: hora d’event al quadrant sense duplicar sortida).
 */
function conductorVehicleWindow(
  q: QuadrantRecord,
  c: QuadrantConductorRecord
): { startTime: string; endTime: string } | null {
  const sortida =
    trimStr(c.startTime) ||
    trimStr(q.startTime) ||
    trimStr(c.arrivalTime) ||
    trimStr(q.arrivalTime)
  const tornada =
    trimStr(c.endTime) || trimStr(q.endTime) || sortida
  if (!sortida) return null
  return { startTime: sortida, endTime: tornada }
}

type ManualAssignmentRecord = Record<string, unknown> & {
  plate?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  status?: string
}

const ACTIVE_ASSIGNMENT_STATUSES = new Set(['pending', 'confirmed', 'addedToTorns'])

const resolveRange = (startDate?: string, startTime?: string, endDate?: string, endTime?: string) => {
  if (!startDate) return null
  const start = toDateTime(startDate, startTime)
  const end = toDateTime(endDate || startDate, endTime || startTime)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  return { start, end }
}

/* =========================
   POST
========================= */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text()
    if (!rawBody.trim()) {
      return NextResponse.json({ error: 'Missing body' }, { status: 400 })
    }

    let parsed: {
      startDate?: string
      startTime?: string
      endDate?: string
      endTime?: string
    }

    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { startDate, startTime, endDate, endTime } = parsed

    if (!startDate || !startTime || !endDate || !endTime) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const dayRange = orderedDayRangeFromISOStrings(startDate, endDate)
    if (!dayRange) {
      return NextResponse.json({ error: 'Invalid startDate or endDate' }, { status: 400 })
    }

    const reqStart = toDateTime(startDate, startTime)
    const reqEnd = toDateTime(endDate, endTime)

    /* =========================
       1) VEHICLES (cataleg)
    ========================= */
    const vehSnap = await db.collection('transports').get()

    const vehicles: Vehicle[] = vehSnap.docs
      .map(d => ({
        id: d.id,
        plate: d.data().plate || d.data().matricula || '',
        type: d.data().type || '',
      }))
      .filter(v => Boolean(v.plate))

    /* =========================
       2) OCUPACIONS REALS
       - Quadrants
       - Assignacions manuals (transportAssignmentsV2)
    ========================= */
    const quadrantCols = [
      'quadrantsLogistica',
      'quadrantsServeis',
      'quadrantsCuina',
      'quadrantsEmpresa',
    ]

    const occupationMap = new Map<string, Occupation[]>()

    const pushOccupation = (occupation: Occupation) => {
      const key = normalizeTransportPlateKey(occupation.plate)
      if (!key) return
      const current = occupationMap.get(key) || []
      current.push(occupation)
      occupationMap.set(key, current)
    }

    for (const col of quadrantCols) {
      const { docs } = await queryQuadrantCollectionDocsInDateRange(
        db.collection(col),
        dayRange.start,
        dayRange.end
      )

      for (const doc of docs) {
        const q = doc.data() as QuadrantRecord
        const conductors = Array.isArray(q.conductors) ? q.conductors : []
        const quadrantStartDate =
          typeof q.startDate === 'string' && q.startDate.trim() ? q.startDate : undefined

        conductors.forEach((c) => {
          const fromRowStart =
            typeof c.startDate === 'string' && c.startDate.trim()
              ? c.startDate.trim()
              : ''
          const rowStartDate = fromRowStart || quadrantStartDate
          const window = conductorVehicleWindow(q, c)
          if (!c?.plate || !rowStartDate || !window) return
          const fromRowEnd =
            typeof c.endDate === 'string' && c.endDate.trim() ? c.endDate.trim() : ''
          const rowEndDate = fromRowEnd || rowStartDate
          const range = resolveRange(
            rowStartDate,
            window.startTime,
            rowEndDate,
            window.endTime
          )
          if (!range) return
          if (!overlaps(reqStart, reqEnd, range.start, range.end)) return

          pushOccupation({
            plate: c.plate,
            start: range.start,
            end: range.end,
          })
        })
      }
    }

    // Assignacions manuals (eviten dobles reserves)
    const dayKeys = dayKeyRange(startDate, endDate)
    let assignDocs: QueryDocumentSnapshot[] = []

    if (dayKeys.length > 0) {
      try {
        const chunks: string[][] = []
        for (let i = 0; i < dayKeys.length; i += 10) {
          chunks.push(dayKeys.slice(i, i + 10))
        }

        for (const chunk of chunks) {
          const snap = await db
            .collection('transportAssignmentsV2')
            .where('dayKeys', 'array-contains-any', chunk)
            .get()
          assignDocs.push(...snap.docs)
        }
      } catch (err) {
        console.warn('[transports/available] fallback assignments fetch', err)
        const snap = await db.collection('transportAssignmentsV2').get()
        assignDocs = snap.docs
      }
    }

    assignDocs.forEach(doc => {
      const a = doc.data() as ManualAssignmentRecord
      const status = String(a?.status || 'pending')
      if (!ACTIVE_ASSIGNMENT_STATUSES.has(status)) return

      if (!a?.plate || !a?.startDate || !a?.startTime) return

      const start = toDateTime(a.startDate, a.startTime)
      const end = toDateTime(a.endDate || a.startDate, a.endTime || a.startTime)
      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return

      if (!overlaps(reqStart, reqEnd, start, end)) return

      pushOccupation({
        plate: a.plate,
        start,
        end,
      })
    })

    /* =========================
       3) DISPONIBILITAT
    ========================= */
    const result = vehicles.map(v => {
      const plateKey = normalizeTransportPlateKey(v.plate)
      const busy = (occupationMap.get(plateKey) || []).some(o =>
        overlaps(reqStart, reqEnd, o.start, o.end)
      )

      return {
        id: v.id,
        plate: v.plate,
        type: v.type,
        available: !busy,
      }
    })

    return NextResponse.json({ vehicles: result })
  } catch (e) {
    console.error('[transports/available]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

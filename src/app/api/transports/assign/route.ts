// src/app/api/transports/assign/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  orderedDayRangeFromLocalDates,
  queryQuadrantCollectionDocsInDateRange,
} from '@/lib/firestoreQuadrantsRangeQuery'

export const runtime = 'nodejs'

const COLLECTION = 'transportAssignmentsV2'
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'addedToTorns'])

type Occupation = {
  source: 'quadrant' | 'assignment'
  refId?: string
  plate: string
  start: Date
  end: Date
  status?: string
}

type AssignmentInput = {
  plate?: string
  vehicleId?: string
  vehicleType?: string
  conductorId?: string
  conductorName?: string
  destination?: string
  department?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  notes?: string
}

type QuadrantConductorRecord = {
  plate?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  status?: string
}

type QuadrantRecord = Record<string, unknown> & {
  status?: string
  conductors?: QuadrantConductorRecord[]
}

type AssignmentRecord = Record<string, unknown> & {
  plate?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  status?: string
  dayKeys?: string[]
}

type TokenLike = {
  name?: string
  email?: string
  sub?: string
}

const quadrantCollections = [
  'quadrantsLogistica',
  'quadrantsServeis',
  'quadrantsCuina',
  'quadrantsEmpresa',
]

const toDateTime = (date?: string, time?: string) =>
  date ? new Date(`${date}T${time || '00:00'}:00`) : null

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

async function getQuadrantOccupations(
  plate: string,
  reqStart: Date,
  reqEnd: Date
): Promise<Occupation[]> {
  const out: Occupation[] = []
  const { start: rangeStart, end: rangeEnd } = orderedDayRangeFromLocalDates(reqStart, reqEnd)

  for (const col of quadrantCollections) {
    const { docs } = await queryQuadrantCollectionDocsInDateRange(
      db.collection(col),
      rangeStart,
      rangeEnd
    )

    for (const doc of docs) {
      const q = doc.data() as QuadrantRecord
      const conductors = Array.isArray(q.conductors) ? q.conductors : []

      conductors.forEach((c) => {
        if (!c?.plate || c.plate !== plate) return
        if (!c?.startDate || !c?.startTime) return

        const start = toDateTime(c.startDate, c.startTime)
        const end = toDateTime(c.endDate || c.startDate, c.endTime || c.startTime)
        if (!start || !end) return

        out.push({
          source: 'quadrant',
          plate,
          start,
          end,
          status: String(c?.status || q?.status || ''),
        })
      })
    }
  }

  return out
}

async function getAssignmentOccupations(
  plate: string,
  opts?: { ignoreId?: string }
): Promise<Occupation[]> {
  const out: Occupation[] = []
  const snap = await db.collection(COLLECTION).where('plate', '==', plate).get()

  snap.docs.forEach(doc => {
    if (opts?.ignoreId && doc.id === opts.ignoreId) return

    const data = doc.data() as AssignmentRecord
    const status = String(data?.status || 'pending')
    if (!ACTIVE_STATUSES.has(status)) return

    const start = toDateTime(data?.startDate, data?.startTime)
    const end = toDateTime(data?.endDate || data?.startDate, data?.endTime || data?.startTime)
    if (!start || !end) return

    out.push({
      source: 'assignment',
      refId: doc.id,
      plate: data?.plate || '',
      start,
      end,
      status,
    })
  })

  return out
}

async function findConflict(
  plate: string,
  reqStart: Date,
  reqEnd: Date,
  opts?: { ignoreId?: string }
) {
  const [quadrantOccs, assignmentOccs] = await Promise.all([
    getQuadrantOccupations(plate, reqStart, reqEnd),
    getAssignmentOccupations(plate, { ignoreId: opts?.ignoreId }),
  ])

  const all = [...quadrantOccs, ...assignmentOccs]
  return all.find(o => overlaps(reqStart, reqEnd, o.start, o.end))
}

function sanitizeInput(body: AssignmentInput) {
  const plate = body?.plate?.trim()
  const startDate = body?.startDate?.trim()
  const startTime = body?.startTime?.trim()
  const endDate = body?.endDate?.trim() || startDate
  const endTime = body?.endTime?.trim() || startTime

  if (!plate || !startDate || !startTime || !endDate || !endTime) {
    return { error: 'Missing required fields' as const }
  }

  const reqStart = toDateTime(startDate, startTime)
  const reqEnd = toDateTime(endDate, endTime)

  if (!reqStart || !reqEnd || isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) {
    return { error: 'Invalid date/time' as const }
  }

  if (reqEnd <= reqStart) {
    return { error: 'End must be after start' as const }
  }

  const dayKeys = dayKeyRange(startDate, endDate)
  if (!dayKeys.length) {
    return { error: 'Invalid date range' as const }
  }

  return {
    plate,
    startDate,
    startTime,
    endDate,
    endTime,
    dayKeys,
    reqStart,
    reqEnd,
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const authToken = token as TokenLike

    const body = (await req.json()) as AssignmentInput
    const cleaned = sanitizeInput(body)
    if ('error' in cleaned) {
      return NextResponse.json({ error: cleaned.error }, { status: 400 })
    }

    const conflict = await findConflict(cleaned.plate, cleaned.reqStart, cleaned.reqEnd)
    if (conflict) {
      return NextResponse.json(
        {
          error: 'Vehicle already assigned in this range',
          conflict: {
            source: conflict.source,
            refId: conflict.refId,
            start: conflict.start.toISOString(),
            end: conflict.end.toISOString(),
            status: conflict.status,
          },
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const doc = {
      plate: cleaned.plate,
      vehicleId: body.vehicleId || '',
      vehicleType: body.vehicleType || '',
      conductorId: body.conductorId || '',
      conductorName: body.conductorName || '',
      destination: body.destination || '',
      department: body.department || '',
      startDate: cleaned.startDate,
      startTime: cleaned.startTime,
      endDate: cleaned.endDate,
      endTime: cleaned.endTime,
      dayKeys: cleaned.dayKeys,
      notes: body.notes || '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      createdBy: authToken.name || authToken.email || authToken.sub || 'system',
    }

    const ref = await db.collection(COLLECTION).add(doc)

    return NextResponse.json(
      { ok: true, id: ref.id, assignment: { id: ref.id, ...doc } },
      { status: 201 }
    )
  } catch (e) {
    console.error('[api/transports/assign POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || undefined
    const plate = searchParams.get('plate') || undefined
    const includeCancelled = searchParams.get('includeCancelled') === 'true'

    const base = db.collection(COLLECTION)
    const filters: Array<(a: AssignmentRecord) => boolean> = []
    let query: FirebaseFirestore.Query = base

    if (date) {
      query = query.where('dayKeys', 'array-contains', date)
      filters.push(a => Array.isArray(a.dayKeys) && a.dayKeys.includes(date))
    }

    if (plate) {
      query = query.where('plate', '==', plate)
      filters.push(a => a.plate === plate)
    }

    const applyFilters = (items: AssignmentRecord[]) =>
      items.filter(a => {
        if (!includeCancelled && a.status === 'cancelled') return false
        return filters.every(f => f(a))
      })

    const snap = await query.get().catch(async err => {
      console.warn('[api/transports/assign GET] query fallback', err)
      const all = await base.get()
      return {
        docs: all.docs.filter(d => {
          const data = d.data() as AssignmentRecord
          return applyFilters([{ ...data, id: d.id }]).length > 0
        }),
      } as FirebaseFirestore.QuerySnapshot
    })

    const assignments = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as AssignmentRecord) }))
      .filter(a => (includeCancelled ? true : a.status !== 'cancelled'))
      .sort((a, b) => {
        const aKey = `${a.startDate || ''}T${a.startTime || ''}`
        const bKey = `${b.startDate || ''}T${b.startTime || ''}`
        return aKey.localeCompare(bKey)
      })

    return NextResponse.json({ assignments: applyFilters(assignments) })
  } catch (e) {
    console.error('[api/transports/assign GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

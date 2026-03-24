// src/app/api/transports/assign/[id]/accept/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'

const COLLECTION = 'transportAssignmentsV2'
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'addedToTorns'])
const ALLOWED_TARGETS = new Set(['confirmed', 'addedToTorns', 'cancelled'])

type Occupation = {
  source: 'quadrant' | 'assignment'
  refId?: string
  plate: string
  start: Date
  end: Date
  status?: string
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

async function getQuadrantOccupations(plate: string): Promise<Occupation[]> {
  const out: Occupation[] = []

  for (const col of quadrantCollections) {
    const snap = await db.collection(col).get()

    snap.docs.forEach(doc => {
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
    })
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
    getQuadrantOccupations(plate),
    getAssignmentOccupations(plate, { ignoreId: opts?.ignoreId }),
  ])

  const all = [...quadrantOccs, ...assignmentOccs]
  return all.find(o => overlaps(reqStart, reqEnd, o.start, o.end))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const authToken = token as TokenLike

    const id = params?.id
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const body = await req.json().catch(() => ({})) as { status?: string }
    const targetStatus = body?.status || 'confirmed'
    if (!ALLOWED_TARGETS.has(targetStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const ref = db.collection(COLLECTION).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = snap.data() as AssignmentRecord
    const plate = data?.plate
    const startDate = data?.startDate
    const startTime = data?.startTime
    const endDate = data?.endDate || startDate
    const endTime = data?.endTime || startTime

    const reqStart = toDateTime(startDate, startTime)
    const reqEnd = toDateTime(endDate, endTime)

    if (!plate || !reqStart || !reqEnd || isNaN(reqStart.getTime()) || isNaN(reqEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid stored data' }, { status: 400 })
    }

    if (targetStatus !== 'cancelled') {
      const conflict = await findConflict(plate, reqStart, reqEnd, { ignoreId: id })
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
    }

    const now = new Date().toISOString()
    await ref.update({
      status: targetStatus,
      updatedAt: now,
      updatedBy: authToken.name || authToken.email || authToken.sub || 'system',
      confirmedAt: targetStatus === 'cancelled' ? null : now,
    })

    return NextResponse.json({ ok: true, status: targetStatus })
  } catch (e) {
    console.error('[api/transports/assign/:id/accept POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

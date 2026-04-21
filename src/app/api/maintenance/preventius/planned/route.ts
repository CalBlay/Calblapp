import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
  department?: string
}

type PlannedPayload = {
  templateId?: string | null
  title: string
  date: string // yyyy-MM-dd
  startTime: string // HH:mm
  endTime: string // HH:mm
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  workerIds?: string[]
  workerNames?: string[]
}

type PlannedItem = Record<string, unknown> & {
  workerIds?: string[]
  workerNames?: string[]
  date?: string
  startTime?: string
}

const normalizeText = (value?: string) =>
  (value || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const canRead = (role: string) =>
  role === 'admin' || role === 'direccio' || role === 'cap' || role === 'treballador'

const canWrite = (role: string) => role === 'admin' || role === 'direccio' || role === 'cap'

const normalizePriority = (value?: string) => {
  const v = (value || '').trim().toLowerCase()
  if (v === 'urgent') return 'urgent'
  if (v === 'alta') return 'alta'
  if (v === 'baixa') return 'baixa'
  return 'normal'
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!canRead(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dept = normalizeText(user.department || '')
  const userName = normalizeText(user.name || '')

  const { searchParams } = new URL(req.url)
  const start = (searchParams.get('start') || '').trim()
  const end = (searchParams.get('end') || '').trim()

  try {
    let query: FirebaseFirestore.Query = db.collection('maintenancePreventiusPlanned')
    if (start) query = query.where('date', '>=', start)
    if (end) query = query.where('date', '<=', end)

    const snap = await query.get()
    let items: PlannedItem[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))

    if (role === 'treballador' && dept === 'manteniment') {
      items = items.filter((i) => {
        const ids = Array.isArray(i.workerIds) ? i.workerIds : []
        if (ids.includes(user.id)) return true
        const names = Array.isArray(i.workerNames) ? i.workerNames : []
        if (!userName || names.length === 0) return false
        return names.map((n: string) => normalizeText(n)).includes(userName)
      })
    }

    items.sort((a, b) => {
      const ad = String(a.date || '')
      const bd = String(b.date || '')
      if (ad !== bd) return ad.localeCompare(bd)
      return String(a.startTime || '').localeCompare(String(b.startTime || ''))
    })

    return NextResponse.json({ items })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!canWrite(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as PlannedPayload
    const title = (body.title || '').trim()
    const date = (body.date || '').trim()
    const startTime = (body.startTime || '').trim()
    const endTime = (body.endTime || '').trim()

    if (!title || !date || !startTime || !endTime) {
      return NextResponse.json({ error: 'Falten camps obligatoris' }, { status: 400 })
    }

    const now = Date.now()
    const doc = await db.collection('maintenancePreventiusPlanned').add({
      templateId: body.templateId || null,
      title,
      date,
      startTime,
      endTime,
      priority: normalizePriority(body.priority),
      location: (body.location || '').trim(),
      workerIds: Array.isArray(body.workerIds) ? body.workerIds : [],
      workerNames: Array.isArray(body.workerNames) ? body.workerNames : [],
      createdAt: now,
      createdById: user.id,
      createdByName: user.name || '',
      updatedAt: now,
      updatedById: user.id,
      updatedByName: user.name || '',
    })

    return NextResponse.json({ id: doc.id }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

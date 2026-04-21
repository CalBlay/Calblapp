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

type PlannedPatch = {
  templateId?: string | null
  title?: string
  date?: string
  startTime?: string
  endTime?: string
  priority?: 'urgent' | 'alta' | 'normal' | 'baixa'
  location?: string
  workerIds?: string[]
  workerNames?: string[]
}

type PlannedRecord = {
  workerIds?: string[]
}

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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!canRead(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const dept = (user.department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

  const { id } = await ctx.params
  try {
    const ref = db.collection('maintenancePreventiusPlanned').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const data = (snap.data() || {}) as PlannedRecord
    if (role === 'treballador' && dept === 'manteniment') {
      const ids = Array.isArray(data?.workerIds) ? data.workerIds : []
      if (!ids.includes(user.id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ item: { id: snap.id, ...data } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!canWrite(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  try {
    const body = (await req.json()) as PlannedPatch
    const patch: Record<string, unknown> = {}
    if (body.templateId !== undefined) patch.templateId = body.templateId
    if (body.title !== undefined) patch.title = String(body.title || '').trim()
    if (body.date !== undefined) patch.date = String(body.date || '').trim()
    if (body.startTime !== undefined) patch.startTime = String(body.startTime || '').trim()
    if (body.endTime !== undefined) patch.endTime = String(body.endTime || '').trim()
    if (body.priority !== undefined) patch.priority = normalizePriority(body.priority)
    if (body.location !== undefined) patch.location = String(body.location || '').trim()
    if (body.workerIds !== undefined) patch.workerIds = Array.isArray(body.workerIds) ? body.workerIds : []
    if (body.workerNames !== undefined)
      patch.workerNames = Array.isArray(body.workerNames) ? body.workerNames : []

    patch.updatedAt = Date.now()
    patch.updatedById = user.id
    patch.updatedByName = user.name || ''

    await db.collection('maintenancePreventiusPlanned').doc(id).set(patch, { merge: true })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (!canWrite(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await ctx.params
  try {
    await db.collection('maintenancePreventiusPlanned').doc(id).delete()
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

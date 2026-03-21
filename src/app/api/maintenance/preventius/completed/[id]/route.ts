import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { normalizeRole } from '@/lib/roles'
import admin from 'firebase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionUser = {
  id: string
  name?: string
  role?: string
}

const normalizeCompletedStatus = (value?: string) => {
  const status = String(value || 'pendent').trim().toLowerCase()
  if (status === 'nou') return 'nou'
  if (status === 'assignat' || status === 'pendent') return 'assignat'
  if (status === 'espera') return 'espera'
  if (status === 'resolut' || status === 'validat') return 'validat'
  if (status === 'en curs') return 'en_curs'
  if (status === 'fet') return 'fet'
  if (status === 'no_fet' || status === 'no fet') return 'no_fet'
  if (status === 'en_curs') return 'en_curs'
  return 'assignat'
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  if (role !== 'admin' && role !== 'direccio' && role !== 'cap' && role !== 'treballador') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  try {
    const ref = db.collection('maintenancePreventiusCompleted').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ record: { id: snap.id, ...snap.data(), status: normalizeCompletedStatus((snap.data() as any)?.status) } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = session.user as SessionUser
  const role = normalizeRole(user.role || '')
  const dept = ((user as any).department || '')
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
  const canReopen = role === 'admin' || (role === 'cap' && dept === 'manteniment')
  if (!canReopen) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  try {
    const body = (await req.json()) as { status?: string; reason?: string | null }
    const nextStatus = normalizeCompletedStatus(body.status)
    if (nextStatus !== 'fet') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const ref = db.collection('maintenancePreventiusCompleted').doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const current = snap.data() as any
    const currentStatus = normalizeCompletedStatus(current?.status)
    if (currentStatus !== 'validat') {
      return NextResponse.json({ error: 'Nomes es pot reobrir un preventiu validat' }, { status: 400 })
    }

    const now = Date.now()
    await ref.set(
      {
        status: 'fet',
        updatedAt: now,
        updatedById: user.id,
        updatedByName: user.name || '',
        reopenedAt: now,
        reopenedById: user.id,
        reopenedByName: user.name || '',
        reopenedReason: String(body.reason || '').trim(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          status: 'fet',
          at: now,
          byId: user.id,
          byName: user.name || '',
          note: 'Reobert des de Validat',
        }),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

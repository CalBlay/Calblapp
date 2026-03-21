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

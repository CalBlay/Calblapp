export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'

const COL = DOTACIO_COLLECTIONS.requests

const STATUSES = new Set([
  'draft',
  'submitted',
  'approved',
  'rejected',
  'fulfilled',
  'cancelled',
])

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const ref = db.collection(COL).doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const body = (await req.json()) as { status?: string; notes?: string }
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

  if (body.status !== undefined) {
    const s = String(body.status || '').trim()
    if (!STATUSES.has(s)) {
      return NextResponse.json({ error: 'Estat invàlid.' }, { status: 400 })
    }
    patch.status = s
  }
  if (body.notes !== undefined) {
    patch.notes = String(body.notes || '').trim() || null
  }

  await ref.update(patch)
  const next = await ref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

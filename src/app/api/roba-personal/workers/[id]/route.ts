export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { workerCodeTaken } from '@/lib/roba-personal/workerCode'

const COL = DOTACIO_COLLECTIONS.workers

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const snap = await db.collection(COL).doc(id).get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }
  return NextResponse.json(
    serializeFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)
  )
}

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

  const body = (await req.json()) as Record<string, unknown>
  const cur = snap.data() as Record<string, unknown>
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

  if (body.name !== undefined) patch.name = str(body.name)
  if (body.code !== undefined) patch.code = str(body.code)
  if (body.department !== undefined) patch.department = str(body.department)
  if (body.email !== undefined) patch.email = str(body.email) || null
  if (body.phone !== undefined) patch.phone = str(body.phone) || null
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive)
  if (body.jobTitle !== undefined) patch.jobTitle = str(body.jobTitle) || null
  if (body.notes !== undefined) patch.notes = str(body.notes) || null

  const nextCode = patch.code !== undefined ? str(patch.code) : str(cur.code)
  if (nextCode && (await workerCodeTaken(nextCode, id))) {
    return NextResponse.json(
      { error: 'Ja existeix un altre treballador amb aquest codi.' },
      { status: 409 }
    )
  }

  const nextName = patch.name !== undefined ? str(patch.name) : str(cur.name)
  const nextDept =
    patch.department !== undefined ? str(patch.department) : str(cur.department)
  if (!nextName || !nextCode || !nextDept) {
    return NextResponse.json(
      { error: 'name, code i department són obligatoris.' },
      { status: 400 }
    )
  }

  await ref.update(patch)
  const next = await ref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

export async function DELETE(
  _req: Request,
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

  await ref.update({
    isActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return NextResponse.json({ ok: true })
}

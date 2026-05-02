export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { workerCodeTaken } from '@/lib/roba-personal/workerCode'
import { serializeRobaWorkerRow, str } from '@/lib/roba-personal/robaWorkerFromPersonnel'
import { isRobaProductDepartmentValue } from '@/data/departments'

const COL = DOTACIO_COLLECTIONS.workers

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
  const row = serializeRobaWorkerRow(id, snap.data() as Record<string, unknown>)
  return NextResponse.json(serializeFirestoreDoc(id, row))
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
  if (body.code !== undefined) patch.workerCode = str(body.code)
  if (body.department !== undefined) {
    const dept = str(body.department)
    if (!isRobaProductDepartmentValue(dept)) {
      return NextResponse.json(
        { error: 'Departament no permès per a roba personal.' },
        { status: 400 }
      )
    }
    patch.department = dept
    patch.departmentLower = dept.toLowerCase()
  }
  if (body.email !== undefined) patch.email = str(body.email) || null
  if (body.phone !== undefined) patch.phone = str(body.phone) || null
  if (body.isActive !== undefined) {
    patch.robaWorkerActive = Boolean(body.isActive)
  }
  if (body.jobTitle !== undefined) patch.jobTitle = str(body.jobTitle) || null
  if (body.notes !== undefined) patch.robaNotes = str(body.notes) || null
  if (body.hasAppUser !== undefined) {
    patch.robaHasAppUser = Boolean(body.hasAppUser)
  }

  let nextCode =
    patch.workerCode !== undefined ? str(patch.workerCode) : str(cur.workerCode || cur.code)
  if (!nextCode) nextCode = id
  if (nextCode && (await workerCodeTaken(nextCode, id))) {
    return NextResponse.json(
      { error: 'Ja existeix un altre treballador amb aquest codi.' },
      { status: 409 }
    )
  }

  const merged = { ...cur, ...patch }
  const nextName = str(merged.name)
  const nextDept = str(merged.department)
  if (!nextName || !nextDept) {
    return NextResponse.json(
      { error: 'name, code (workerCode) i department són obligatoris.' },
      { status: 400 }
    )
  }

  await ref.update(patch)
  const next = await ref.get()
  const row = serializeRobaWorkerRow(next.id, next.data() as Record<string, unknown>)
  return NextResponse.json(serializeFirestoreDoc(next.id, row))
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
    robaWorkerActive: false,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return NextResponse.json({ ok: true })
}

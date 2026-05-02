export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { normalizeRobaProductDepartments } from '@/data/departments'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'

const COL = DOTACIO_COLLECTIONS.products

function str(v: unknown): string {
  return String(v ?? '').trim()
}

async function resolveSupplierName(supplierId: string): Promise<string | null> {
  if (!supplierId) return null
  const snap = await db.collection(SUPPLIERS_COLLECTION).doc(supplierId).get()
  if (!snap.exists) return null
  return str((snap.data() as Record<string, unknown>).name)
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

  if (body.code !== undefined) patch.code = str(body.code).slice(0, 12)
  if (body.supplierId !== undefined) {
    const sid = str(body.supplierId)
    patch.supplierId = sid || null
    if (sid) {
      const resolved = await resolveSupplierName(sid)
      if (resolved) patch.supplier = resolved
    }
  }
  if (body.supplier !== undefined) patch.supplier = str(body.supplier)
  if (body.name !== undefined) patch.name = str(body.name)
  if (body.size !== undefined) patch.size = str(body.size)
  if (body.grup !== undefined) patch.grup = str(body.grup) || 'Roba'
  if (body.familia !== undefined) patch.familia = str(body.familia) || null
  if (body.subfamilia !== undefined) patch.subfamilia = str(body.subfamilia) || null
  if (body.departments !== undefined) {
    const departmentsRaw = Array.isArray(body.departments)
      ? body.departments.map((x) => str(x)).filter(Boolean)
      : []
    const departments = normalizeRobaProductDepartments(departmentsRaw)
    patch.departments = departments.length ? departments : null
  }
  if (body.supplierSku !== undefined) patch.supplierSku = str(body.supplierSku) || null
  if (body.unit !== undefined) patch.unit = str(body.unit) || null
  if (body.category !== undefined) patch.category = str(body.category) || null
  if (body.magatzem !== undefined) {
    patch.magatzem = str(body.magatzem) || DEFAULT_DOTACIO_MAGATZEM
  }
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive)
  if (body.minStock !== undefined) {
    patch.minStock =
      typeof body.minStock === 'number' && !Number.isNaN(body.minStock)
        ? body.minStock
        : null
  }
  if (body.notes !== undefined) patch.notes = str(body.notes) || null

  const nextCode = patch.code !== undefined ? str(patch.code) : str(cur.code)
  const nextSupplier =
    patch.supplier !== undefined ? str(patch.supplier) : str(cur.supplier)
  const nextName = patch.name !== undefined ? str(patch.name) : str(cur.name)
  if (!nextCode || !nextSupplier || !nextName) {
    return NextResponse.json(
      { error: 'code, supplier i name són obligatoris i no poden quedar buits.' },
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

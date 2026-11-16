export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import { DEFAULT_DOTACIO_MAGATZEM } from '@/lib/roba-personal/dotacioDefaults'
import { normalizeRobaProductDepartments } from '@/data/departments'
import { normalizeRobaSizeOptions } from '@/lib/roba-personal/sizeProfiles'

const COL = DOTACIO_COLLECTIONS.products

function str(v: unknown): string {
  return String(v ?? '').trim()
}

async function resolveSupplierName(supplierId: string): Promise<string | null> {
  if (!supplierId) return null
  const snap = await db.collection(DOTACIO_COLLECTIONS.suppliers).doc(supplierId).get()
  if (!snap.exists) return null
  return str((snap.data() as Record<string, unknown>).name)
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const sourceSnap = await db.collection(COL).doc(id).get()
  if (!sourceSnap.exists) return NextResponse.json({ error: 'No trobat' }, { status: 404 })

  const body = (await req.json()) as Record<string, unknown>
  const sizes = normalizeRobaSizeOptions(body.sizes)
  if (sizes.length === 0) {
    return NextResponse.json({ error: 'Cal indicar almenys una talla.' }, { status: 400 })
  }

  const source = sourceSnap.data() as Record<string, unknown>
  const sizeProfileId = str(body.sizeProfileId)
  if (sizeProfileId) {
    const profile = await db.collection(DOTACIO_COLLECTIONS.sizeProfiles).doc(sizeProfileId).get()
    if (!profile.exists) {
      return NextResponse.json({ error: 'Perfil de talles no trobat.' }, { status: 400 })
    }
  }
  const code = str(source.code)
  const name = str(source.name)
  const existingSnap = await db.collection(COL).where('code', '==', code).get()
  const existing = new Set(
    existingSnap.docs
      .filter((doc) => str(doc.data().name).toLocaleLowerCase('ca') === name.toLocaleLowerCase('ca'))
      .map((doc) => str(doc.data().size).toLocaleUpperCase('ca'))
  )
  const missing = sizes.filter((size) => !existing.has(size.toLocaleUpperCase('ca')))
  if (missing.length === 0) return NextResponse.json({ createdCount: 0 })

  const batch = db.batch()
  for (const size of missing) {
    const ref = db.collection(COL).doc()
    batch.set(ref, {
      ...source,
      size,
      sizeProfileId: sizeProfileId || null,
      quantityOnHand: 0,
      quantityReserved: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await batch.commit()
  return NextResponse.json({ createdCount: missing.length }, { status: 201 })
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
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
  if (body.sizeProfileId !== undefined) {
    const profileId = str(body.sizeProfileId)
    if (profileId) {
      const profile = await db.collection(DOTACIO_COLLECTIONS.sizeProfiles).doc(profileId).get()
      if (!profile.exists) {
        return NextResponse.json({ error: 'Perfil de talles no trobat.' }, { status: 400 })
      }
    }
    patch.sizeProfileId = profileId || null
  }
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

  const nextSize = patch.size !== undefined ? str(patch.size) : str(cur.size)
  const identityChanged =
    nextCode !== str(cur.code) ||
    nextName.toLocaleLowerCase('ca') !== str(cur.name).toLocaleLowerCase('ca') ||
    nextSize.toLocaleUpperCase('ca') !== str(cur.size).toLocaleUpperCase('ca')
  if (identityChanged) {
    const sameCodeSnap = await db.collection(COL).where('code', '==', nextCode).get()
    const duplicateSize = sameCodeSnap.docs.some((doc) => {
      if (doc.id === id) return false
      const row = doc.data()
      return (
        str(row.name).toLocaleLowerCase('ca') === nextName.toLocaleLowerCase('ca') &&
        str(row.size).toLocaleUpperCase('ca') === nextSize.toLocaleUpperCase('ca')
      )
    })
    if (duplicateSize) {
      return NextResponse.json(
        { error: 'Aquest article ja té una variant amb aquesta talla.' },
        { status: 409 }
      )
    }
  }

  await ref.update(patch)
  if (body.applySizeProfileToVariants === true && body.sizeProfileId !== undefined) {
    const siblingCode = str(cur.code)
    const siblingName = str(cur.name).toLocaleLowerCase('ca')
    const siblingSnap = await db.collection(COL).where('code', '==', siblingCode).get()
    const siblingBatch = db.batch()
    let siblingCount = 0
    for (const sibling of siblingSnap.docs) {
      if (str(sibling.data().name).toLocaleLowerCase('ca') !== siblingName) continue
      siblingBatch.update(sibling.ref, {
        sizeProfileId: patch.sizeProfileId ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      })
      siblingCount += 1
    }
    if (siblingCount > 0) await siblingBatch.commit()
  }
  const next = await ref.get()
  return NextResponse.json(
    serializeFirestoreDoc(next.id, next.data() as Record<string, unknown>)
  )
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  const { id } = await ctx.params
  const ref = db.collection(COL).doc(id)
  const snap = await ref.get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const data = snap.data() as { quantityOnHand?: number; quantityReserved?: number }
  const onHand = Number(data.quantityOnHand ?? 0)
  const reserved = Number(data.quantityReserved ?? 0)
  if (onHand > 0 || reserved > 0) {
    return NextResponse.json(
      {
        error:
          'No es pot eliminar un producte amb estoc o reserva. Deixeu-lo a zero o desactiveu-lo.',
      },
      { status: 409 }
    )
  }

  await ref.delete()
  return NextResponse.json({ ok: true })
}

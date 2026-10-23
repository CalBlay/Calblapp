export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { serializeRobaSupplier } from '@/lib/roba-personal/suppliers.server'

async function getRobaSupplier(id: string) {
  const ref = db.collection(DOTACIO_COLLECTIONS.suppliers).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null
  const supplier = serializeRobaSupplier(snap.id, snap.data() as Record<string, unknown>)
  return { ref, supplier }
}

async function updateProductSupplierNames(supplierId: string, name: string) {
  const products = await db
    .collection(DOTACIO_COLLECTIONS.products)
    .where('supplierId', '==', supplierId)
    .get()

  for (let index = 0; index < products.docs.length; index += 450) {
    const batch = db.batch()
    for (const product of products.docs.slice(index, index + 450)) {
      batch.set(product.ref, { supplier: name, updatedAt: Date.now() }, { merge: true })
    }
    await batch.commit()
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.compres)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const found = await getRobaSupplier(id)
    if (!found) {
      return NextResponse.json({ error: 'Proveïdor no trobat' }, { status: 404 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = body.name === undefined ? found.supplier.name : String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal el nom del proveïdor' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {
      name,
      ...(body.email !== undefined ? { email: String(body.email || '').trim() } : {}),
      ...(body.phone !== undefined ? { phone: String(body.phone || '').trim() } : {}),
      ...(body.specialty !== undefined
        ? { specialty: String(body.specialty || '').trim() }
        : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes || '').trim() } : {}),
      ...(body.active !== undefined ? { active: body.active !== false } : {}),
      updatedAt: Date.now(),
    }

    await found.ref.set(patch, { merge: true })
    if (name !== found.supplier.name) {
      await updateProductSupplierNames(id, name)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[roba-personal/suppliers/[id]] PATCH', error)
    return NextResponse.json({ error: 'Error actualitzant el proveïdor' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.compres)
  if (!auth.ok) return auth.res

  try {
    const { id } = await params
    const found = await getRobaSupplier(id)
    if (!found) {
      return NextResponse.json({ error: 'Proveïdor no trobat' }, { status: 404 })
    }

    const [productsById, legacyProductsByName] = await Promise.all([
      db.collection(DOTACIO_COLLECTIONS.products).where('supplierId', '==', id).limit(1).get(),
      db
        .collection(DOTACIO_COLLECTIONS.products)
        .where('supplier', '==', found.supplier.name)
        .limit(1)
        .get(),
    ])
    if (!productsById.empty || !legacyProductsByName.empty) {
      return NextResponse.json(
        {
          error:
            'No es pot eliminar perquè està assignat a articles. Canvieu primer el proveïdor d’aquests articles.',
        },
        { status: 409 }
      )
    }

    await found.ref.delete()
    return NextResponse.json({ ok: true, deleted: true })
  } catch (error) {
    console.error('[roba-personal/suppliers/[id]] DELETE', error)
    return NextResponse.json({ error: 'Error eliminant el proveïdor' }, { status: 500 })
  }
}

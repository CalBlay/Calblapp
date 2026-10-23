import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { SUPPLIERS_COLLECTION } from '@/lib/companySuppliers/constants'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireAuth } from '@/lib/server/apiAuth'
import { requireSettingsSuppliersEdit } from '@/lib/server/settingsApiAuth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SupplierSource = 'manteniment' | 'roba'

const collectionForSource = (source: SupplierSource) =>
  source === 'manteniment' ? SUPPLIERS_COLLECTION : DOTACIO_COLLECTIONS.suppliers

const parseSource = (value: string): SupplierSource | null =>
  value === 'manteniment' || value === 'roba' ? value : null

async function updateLinkedNames(source: SupplierSource, supplierId: string, name: string) {
  const collection = source === 'manteniment' ? 'maintenanceMachines' : DOTACIO_COLLECTIONS.products
  const nameField = source === 'manteniment' ? 'supplierName' : 'supplier'
  const linked = await db.collection(collection).where('supplierId', '==', supplierId).get()
  for (let index = 0; index < linked.docs.length; index += 450) {
    const batch = db.batch()
    for (const document of linked.docs.slice(index, index + 450)) {
      batch.set(document.ref, { [nameField]: name, updatedAt: Date.now() }, { merge: true })
    }
    await batch.commit()
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ source: string; id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsSuppliersEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { source: rawSource, id } = await params
    const source = parseSource(rawSource)
    if (!source) return NextResponse.json({ error: 'Origen no vàlid' }, { status: 400 })

    const ref = db.collection(collectionForSource(source)).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Proveïdor no trobat' }, { status: 404 })
    }

    const current = snap.data() as Record<string, unknown>
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const name = body.name === undefined ? String(current.name || '').trim() : String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Cal el nom del proveïdor' }, { status: 400 })
    }

    await ref.set(
      {
        name,
        ...(body.email !== undefined ? { email: String(body.email || '').trim() } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone || '').trim() } : {}),
        ...(body.specialty !== undefined
          ? { specialty: String(body.specialty || '').trim() }
          : {}),
        ...(body.notes !== undefined ? { notes: String(body.notes || '').trim() } : {}),
        ...(body.active !== undefined ? { active: body.active !== false } : {}),
        ...(source === 'manteniment' ? { supplierDepartments: ['Manteniment'] } : {}),
        updatedAt: Date.now(),
      },
      { merge: true }
    )

    if (name !== String(current.name || '').trim()) {
      await updateLinkedNames(source, id, name)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[settings/suppliers/[source]/[id]] PATCH', error)
    return NextResponse.json({ error: 'Error actualitzant el proveïdor' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ source: string; id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res
  if (!(await requireSettingsSuppliersEdit(auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { source: rawSource, id } = await params
    const source = parseSource(rawSource)
    if (!source) return NextResponse.json({ error: 'Origen no vàlid' }, { status: 400 })

    const ref = db.collection(collectionForSource(source)).doc(id)
    const snap = await ref.get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Proveïdor no trobat' }, { status: 404 })
    }

    const currentName = String(snap.data()?.name || '').trim()
    const linkedCollection =
      source === 'manteniment' ? 'maintenanceMachines' : DOTACIO_COLLECTIONS.products
    const linkedNameField = source === 'manteniment' ? 'supplierName' : 'supplier'
    const [byId, byName] = await Promise.all([
      db.collection(linkedCollection).where('supplierId', '==', id).limit(1).get(),
      currentName
        ? db.collection(linkedCollection).where(linkedNameField, '==', currentName).limit(1).get()
        : Promise.resolve(null),
    ])
    if (!byId.empty || (byName && !byName.empty)) {
      const itemLabel = source === 'manteniment' ? 'màquines' : 'articles'
      return NextResponse.json(
        {
          error: `No es pot eliminar perquè està assignat a ${itemLabel}. Canvieu-ne primer el proveïdor.`,
        },
        { status: 409 }
      )
    }

    await ref.delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[settings/suppliers/[source]/[id]] DELETE', error)
    return NextResponse.json({ error: 'Error eliminant el proveïdor' }, { status: 500 })
  }
}

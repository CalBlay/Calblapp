export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import {
  requireRobaPersonalAdmin,
  requireRobaProductsReadAccess,
} from '@/lib/roba-personal/guard'
import { ROBA_SUBMODULE_PATHS } from '@/lib/robaPersonalPermissions'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'
import {
  productDepartmentsVisibleToRobaLead,
  robaProductDepartmentTagsForFirestoreQuery,
} from '@/lib/roba-personal/deptScope'
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

export async function GET() {
  const auth = await requireRobaProductsReadAccess()
  if (!auth.ok) return auth.res

  let items: ReturnType<typeof serializeFirestoreDoc>[]

  if (auth.access.scope === 'full') {
    const snap = await db.collection(COL).limit(10_000).get()
    items = snap.docs.map((d) =>
      serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
    )
  } else {
    const lead =
      auth.access.scope === 'deptLead' ? auth.access.leadDeptNorm : auth.access.workerDeptNorm
    const labels = robaProductDepartmentTagsForFirestoreQuery(lead)
    const [scopedSnap, unrestrictedSnap] = await Promise.all([
      labels.length > 0 && labels.length <= 30
        ? db.collection(COL).where('departments', 'array-contains-any', labels).limit(5_000).get()
        : Promise.resolve(null),
      db.collection(COL).where('departments', '==', null).limit(5_000).get(),
    ])

    const merged = new Map<string, ReturnType<typeof serializeFirestoreDoc>>()
    for (const snap of [scopedSnap, unrestrictedSnap]) {
      if (!snap) continue
      for (const d of snap.docs) {
        const row = serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>)
        if (
          productDepartmentsVisibleToRobaLead(
            (row as { departments?: string[] }).departments,
            lead
          )
        ) {
          merged.set(d.id, row)
        }
      }
    }
    items = [...merged.values()]
  }

  items.sort((a, b) => {
    const c = String(a.code).localeCompare(String(b.code), 'ca')
    if (c !== 0) return c
    const n = String(a.name).localeCompare(String(b.name), 'ca')
    if (n !== 0) return n
    return String(a.size || '').localeCompare(String(b.size || ''), 'ca')
  })
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin(ROBA_SUBMODULE_PATHS.productes)
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const code = str(body.code).slice(0, 12)
    const name = str(body.name)
    const supplierId = str(body.supplierId)
    const supplierManual = str(body.supplier)

    let supplier = supplierManual
    if (supplierId) {
      const resolved = await resolveSupplierName(supplierId)
      if (!resolved) {
        return NextResponse.json({ error: 'Proveïdor no trobat (supplierId).' }, { status: 400 })
      }
      supplier = resolved
    }

    if (!code || !name || !supplier) {
      return NextResponse.json(
        { error: 'Calen code, name i proveïdor (supplierId del catàleg o supplier).' },
        { status: 400 }
      )
    }

    const postedSizes = normalizeRobaSizeOptions(body.sizes)
    const sizes = postedSizes.length > 0 ? postedSizes : [str(body.size)]
    const sizeProfileId = str(body.sizeProfileId)
    if (sizeProfileId) {
      const profile = await db.collection(DOTACIO_COLLECTIONS.sizeProfiles).doc(sizeProfileId).get()
      if (!profile.exists) {
        return NextResponse.json({ error: 'Perfil de talles no trobat.' }, { status: 400 })
      }
    }
    const now = FieldValue.serverTimestamp()
    const magatzemRaw = str(body.magatzem)
    const magatzem = magatzemRaw || DEFAULT_DOTACIO_MAGATZEM

    const departmentsRaw = Array.isArray(body.departments)
      ? body.departments.map((x) => str(x)).filter(Boolean)
      : []
    const departments = normalizeRobaProductDepartments(departmentsRaw)

    const baseDoc: Record<string, unknown> = {
      code,
      supplier,
      supplierId: supplierId || null,
      name,
      grup: str(body.grup) || 'Roba',
      familia: str(body.familia) || null,
      subfamilia: str(body.subfamilia) || null,
      sizeProfileId: sizeProfileId || null,
      departments: departments.length ? departments : null,
      magatzem,
      supplierSku: str(body.supplierSku) || null,
      unit: str(body.unit) || null,
      category: str(body.category) || null,
      isActive: body.isActive !== false,
      minStock:
        typeof body.minStock === 'number' && !Number.isNaN(body.minStock)
          ? body.minStock
          : null,
      quantityOnHand: 0,
      quantityReserved: 0,
      notes: str(body.notes) || null,
      createdAt: now,
      updatedAt: now,
    }

    const existingSnap = await db.collection(COL).where('code', '==', code).get()
    const existingSizes = new Set(
      existingSnap.docs
        .filter((doc) => {
          const row = doc.data() as Record<string, unknown>
          return str(row.name).toLocaleLowerCase('ca') === name.toLocaleLowerCase('ca')
        })
        .map((doc) => str((doc.data() as Record<string, unknown>).size).toLocaleUpperCase('ca'))
    )
    const sizesToCreate = sizes.filter((size) => !existingSizes.has(size.toLocaleUpperCase('ca')))
    if (sizesToCreate.length === 0) {
      return NextResponse.json({ error: 'Aquest article ja existeix amb les talles indicades.' }, { status: 409 })
    }

    const batch = db.batch()
    const refs = sizesToCreate.map((size) => {
      const ref = db.collection(COL).doc()
      batch.set(ref, { ...baseDoc, size: size || '' })
      return ref
    })
    await batch.commit()
    const created = await db.getAll(...refs)
    const products = created.map((snap) =>
      serializeFirestoreDoc(snap.id, snap.data() as Record<string, unknown>)
    )
    return NextResponse.json(
      { products, createdCount: products.length, skippedCount: sizes.length - products.length },
      { status: 201 }
    )
  } catch (e: unknown) {
    console.error('POST roba-personal products', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

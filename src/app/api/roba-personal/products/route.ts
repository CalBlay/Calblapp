export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'

const COL = DOTACIO_COLLECTIONS.products

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const snap = await db.collection(COL).get()
  const items = snap.docs
    .map((d) => serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const c = String(a.code).localeCompare(String(b.code), 'ca')
      if (c !== 0) return c
      return String(a.size).localeCompare(String(b.size), 'ca')
    })
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const code = str(body.code)
    const supplier = str(body.supplier)
    const name = str(body.name)
    const size = str(body.size)
    if (!code || !supplier || !name || !size) {
      return NextResponse.json(
        { error: 'Calen code, supplier, name i size.' },
        { status: 400 }
      )
    }

    const now = FieldValue.serverTimestamp()
    const doc: Record<string, unknown> = {
      code,
      supplier,
      name,
      size,
      supplierSku: str(body.supplierSku) || null,
      unit: str(body.unit) || null,
      category: str(body.category) || null,
      isActive: body.isActive !== false,
      minStock:
        typeof body.minStock === 'number' && !Number.isNaN(body.minStock)
          ? body.minStock
          : null,
      quantityOnHand: 0,
      notes: str(body.notes) || null,
      createdAt: now,
      updatedAt: now,
    }

    const ref = await db.collection(COL).add(doc)
    const created = await ref.get()
    return NextResponse.json(
      serializeFirestoreDoc(created.id, created.data() as Record<string, unknown>),
      { status: 201 }
    )
  } catch (e: unknown) {
    console.error('POST roba-personal products', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

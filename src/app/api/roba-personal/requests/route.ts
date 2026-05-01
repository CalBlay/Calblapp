export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import { requireRobaPersonalAdmin } from '@/lib/roba-personal/guard'
import { serializeFirestoreDoc } from '@/lib/roba-personal/serialize'

const COL = DOTACIO_COLLECTIONS.requests

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const snap = await db.collection(COL).limit(300).get()
  const items = snap.docs
    .map((d) => serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    )
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const body = (await req.json()) as {
    requestingDepartment?: string
    lines?: Array<{ productId?: string; quantity?: number; notes?: string }>
    status?: string
    requestedByWorkerId?: string
    notes?: string
  }
  const requestingDepartment = String(body.requestingDepartment || '').trim()
  if (!requestingDepartment) {
    return NextResponse.json({ error: 'Cal requestingDepartment.' }, { status: 400 })
  }
  const linesIn = Array.isArray(body.lines) ? body.lines : []
  const lines = linesIn
    .map((l) => ({
      productId: String(l.productId || '').trim(),
      quantity: Number(l.quantity),
      notes: String(l.notes || '').trim() || undefined,
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)

  if (lines.length === 0) {
    return NextResponse.json({ error: 'Cal almenys una línia vàlida.' }, { status: 400 })
  }

  const now = FieldValue.serverTimestamp()
  const doc: Record<string, unknown> = {
    requestingDepartment,
    lines,
    status: String(body.status || 'submitted').trim() || 'submitted',
    requestedByWorkerId: String(body.requestedByWorkerId || '').trim() || null,
    notes: String(body.notes || '').trim() || null,
    createdAt: now,
    updatedAt: now,
  }

  const ref = await db.collection(COL).add(doc)
  const created = await ref.get()
  return NextResponse.json(
    serializeFirestoreDoc(created.id, created.data() as Record<string, unknown>),
    { status: 201 }
  )
}

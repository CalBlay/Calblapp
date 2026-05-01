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

export async function GET() {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  const snap = await db.collection(COL).get()
  const items = snap.docs
    .map((d) => serializeFirestoreDoc(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) =>
      String(a.name).localeCompare(String(b.name), 'ca', { sensitivity: 'base' })
    )
  return NextResponse.json(items)
}

export async function POST(req: Request) {
  const auth = await requireRobaPersonalAdmin()
  if (!auth.ok) return auth.res

  try {
    const body = (await req.json()) as Record<string, unknown>
    const name = str(body.name)
    const code = str(body.code)
    const department = str(body.department)
    if (!name || !code || !department) {
      return NextResponse.json(
        { error: 'Calen name, code i department.' },
        { status: 400 }
      )
    }
    if (await workerCodeTaken(code)) {
      return NextResponse.json(
        { error: 'Ja existeix un treballador amb aquest codi.' },
        { status: 409 }
      )
    }

    const now = FieldValue.serverTimestamp()
    const doc: Record<string, unknown> = {
      name,
      code,
      department,
      email: str(body.email) || null,
      phone: str(body.phone) || null,
      isActive: body.isActive !== false,
      jobTitle: str(body.jobTitle) || null,
      notes: str(body.notes) || null,
      source: 'manual',
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
    console.error('POST roba-personal workers', e)
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// file: src/app/api/modifications/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import admin from 'firebase-admin'
import { getToken } from 'next-auth/jwt'

const normalize = (v?: string | null) => (v || '').toLowerCase().trim()

async function assertCanEdit(req: NextRequest, docId: string) {
  const token = await getToken({ req })
  if (!token) return { ok: false, status: 401, error: 'No autoritzat' }

  const snap = await firestoreAdmin.collection('modifications').doc(docId).get()
  if (!snap.exists) return { ok: false, status: 404, error: 'Modificació no trobada' }

  const data = snap.data() as any
  const isOwner =
    normalize(data.createdById) === normalize(token.sub) ||
    normalize(data.createdByEmail) === normalize((token as any).email) ||
    normalize(data.createdBy) === normalize(token.name) ||
    normalize(data.createdBy) === normalize((token as any).email)

  if (!isOwner) return { ok: false, status: 403, error: 'Només el creador pot modificar/eliminar' }

  return { ok: true, snap }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const payload = await req.json()

    const permission = await assertCanEdit(req, id)
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status })
    }

    const docRef = firestoreAdmin.collection('modifications').doc(id)

    const toUpdate = {
      ...payload,
      updatedAt: admin.firestore.Timestamp.now(),
    }

    await docRef.set(toUpdate, { merge: true })

    const updated = await docRef.get()

    return NextResponse.json(
      { modification: { id: updated.id, ...updated.data() } },
      { status: 200 }
    )
  } catch (err) {
    console.error('[modifications PATCH] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const permission = await assertCanEdit(req, id)
    if (!permission.ok) {
      return NextResponse.json({ error: permission.error }, { status: permission.status })
    }

    await firestoreAdmin.collection('modifications').doc(id).delete()
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[modifications DELETE] error', err)
    return NextResponse.json({ error: 'Error intern' }, { status: 500 })
  }
}

// file: src/app/api/avisos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { Timestamp } from 'firebase-admin/firestore'

export const runtime = 'nodejs'

/* ======================================================
   GET — Llistar avisos per codi d’esdeveniment
   ====================================================== */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Missing event code' }, { status: 400 })
  }

  const snap = await db
    .collection('avisos')
    .where('code', '==', code)
    .orderBy('createdAt', 'desc')
    .get()

  const avisos = snap.docs.map(doc => {
    const d = doc.data()
    return {
      id: doc.id,
      code: d.code,
      content: d.content,
      createdBy: d.createdBy,
      createdAt: d.createdAt?.toDate
        ? d.createdAt.toDate().toISOString()
        : d.createdAt,
      editedAt: d.editedAt?.toDate
        ? d.editedAt.toDate().toISOString()
        : null,
    }
  })

  return NextResponse.json({ avisos })
}

/* ======================================================
   POST — Crear un nou avís
   ====================================================== */
export async function POST(req: NextRequest) {
  const { code, content, userName, department } = await req.json()

  if (!code || !content || !userName || !department) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const ref = await db.collection('avisos').add({
    code,
    content,
    createdAt: Timestamp.now(),
    editedAt: null,
    createdBy: {
      name: userName,
      department,
    },
  })

  return NextResponse.json({ id: ref.id })
}

/* ======================================================
   PUT — Editar un avís existent
   ====================================================== */
export async function PUT(req: NextRequest) {
  const { id, content } = await req.json()

  if (!id || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const docRef = db.collection('avisos').doc(id)

  await docRef.update({
    content,
    editedAt: Timestamp.now(),
  })

  return NextResponse.json({ ok: true })
}

/* ======================================================
   DELETE — Eliminar un avís
   ====================================================== */
export async function DELETE(req: NextRequest) {
  const { id } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  await db.collection('avisos').doc(id).delete()
  return NextResponse.json({ ok: true })
}

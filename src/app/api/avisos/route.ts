// file: src/app/api/avisos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { Timestamp } from 'firebase-admin/firestore'
import { requireAuth } from '@/lib/server/apiAuth'
import { normalizeRole } from '@/lib/roles'

export const runtime = 'nodejs'

const norm = (value?: string | null) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

async function canEditAviso(
  avisoId: string,
  auth: { user: { id: string; name?: string | null; role?: string | null } }
) {
  const role = normalizeRole(auth.user.role)
  if (role === 'admin' || role === 'direccio') return true

  const snap = await db.collection('avisos').doc(avisoId).get()
  if (!snap.exists) return false
  const createdBy = (snap.data()?.createdBy || {}) as { name?: string }
  return norm(createdBy.name) === norm(auth.user.name)
}

/* ======================================================
   GET — Llistar avisos per codi d'esdeveniment
   ====================================================== */
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

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

  const avisos = snap.docs.map((doc) => {
    const d = doc.data()
    return {
      id: doc.id,
      code: d.code,
      content: d.content,
      createdBy: d.createdBy,
      createdAt: d.createdAt?.toDate
        ? d.createdAt.toDate().toISOString()
        : d.createdAt,
      editedAt: d.editedAt?.toDate ? d.editedAt.toDate().toISOString() : null,
    }
  })

  return NextResponse.json({ avisos })
}

/* ======================================================
   POST — Crear un nou avís
   ====================================================== */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { code, content } = await req.json()

  if (!code || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const ref = await db.collection('avisos').add({
    code,
    content,
    createdAt: Timestamp.now(),
    editedAt: null,
    createdBy: {
      name: auth.user.name || 'Desconegut',
      department: auth.user.department || '',
    },
  })

  return NextResponse.json({ id: ref.id })
}

/* ======================================================
   PUT — Editar un avís existent
   ====================================================== */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id, content } = await req.json()

  if (!id || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  if (!(await canEditAviso(String(id), auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.collection('avisos').doc(String(id)).update({
    content,
    editedAt: Timestamp.now(),
  })

  return NextResponse.json({ ok: true })
}

/* ======================================================
   DELETE — Eliminar un avís
   ====================================================== */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { id } = await req.json()

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  if (!(await canEditAviso(String(id), auth))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.collection('avisos').doc(String(id)).delete()
  return NextResponse.json({ ok: true })
}

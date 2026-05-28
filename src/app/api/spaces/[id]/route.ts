import { NextResponse } from 'next/server'
import type { DocumentReference } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { SPACES_ACTION } from '@/lib/spacesPermissions'
import { requireSpacesAction } from '@/lib/server/spacesApiAuth'

export const runtime = 'nodejs'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth.ok) return auth.res
    const canDelete = await requireSpacesAction(auth, SPACES_ACTION.BBDD_DELETE)
    if (!canDelete) {
      return NextResponse.json(
        { error: 'No tens permisos per eliminar espais.' },
        { status: 403 }
      )
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { error: 'Falta ID de la finca.' },
        { status: 400 }
      )
    }

    const ref = db.collection('finques').doc(id)
    const snap = await ref.get()

    if (snap.exists) {
      await ref.delete()
      return NextResponse.json({ ok: true, id })
    }

    // Fallback: si l'id es el codi, buscar per camps coneguts
    const matches = new Map<string, DocumentReference>()
    const codeSnap = await db.collection('finques').where('code', '==', id).get()
    codeSnap.forEach((doc) => matches.set(doc.id, doc.ref))

    const codiSnap = await db.collection('finques').where('codi', '==', id).get()
    codiSnap.forEach((doc) => matches.set(doc.id, doc.ref))

    if (matches.size === 0) {
      return NextResponse.json(
        { error: "No s'ha trobat cap finca amb aquest id o codi." },
        { status: 404 }
      )
    }

    const batch = db.batch()
    for (const docRef of matches.values()) {
      batch.delete(docRef)
    }
    await batch.commit()

    return NextResponse.json({
      ok: true,
      id,
      deletedIds: Array.from(matches.keys()),
    })
  } catch (err) {
    console.error('Error eliminant espai:', err)
    return NextResponse.json(
      { error: 'Error intern al eliminar la finca.' },
      { status: 500 }
    )
  }
}

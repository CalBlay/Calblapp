export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAllergensBbddEdit } from '@/lib/server/allergensApiAuth'

async function removeAllergenKeyFromPlats(key: string) {
  let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null

  while (true) {
    let query: FirebaseFirestore.Query = firestoreAdmin
      .collection('plats')
      .orderBy(FieldPath.documentId())
      .limit(450)

    if (lastDoc) query = query.startAfter(lastDoc)

    const snap = await query.get()
    if (snap.empty) break

    const batch = firestoreAdmin.batch()
    let batchCount = 0

    for (const docSnap of snap.docs) {
      const data = docSnap.data()
      if (!data?.allergens || !(key in data.allergens)) continue
      batch.update(docSnap.ref, { [`allergens.${key}`]: FieldValue.delete() })
      batchCount++
    }

    if (batchCount > 0) await batch.commit()
    lastDoc = snap.docs[snap.docs.length - 1]
    if (snap.size < 450) break
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    const { key } = await context.params
    const allergenKey = String(key || '').trim()
    if (!allergenKey) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    const body = (await req.json()) as { label?: string; source?: string }
    const label = String(body.label || '').trim()
    if (!label) {
      return NextResponse.json({ error: 'Missing label' }, { status: 400 })
    }

    await firestoreAdmin
      .collection('allergens')
      .doc(allergenKey)
      .set(
        {
          label,
          updatedAt: Timestamp.now(),
          source: body.source || 'manual',
        },
        { merge: true }
      )

    return NextResponse.json({ ok: true, key: allergenKey })
  } catch (error) {
    console.error('[allergens/bbdd/allergens/[key] PUT]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    const { key } = await context.params
    const allergenKey = String(key || '').trim()
    if (!allergenKey) {
      return NextResponse.json({ error: 'Missing key' }, { status: 400 })
    }

    const url = new URL(req.url)
    const removeFromPlats = url.searchParams.get('removeFromPlats') === 'true'

    await firestoreAdmin.collection('allergens').doc(allergenKey).delete()

    if (removeFromPlats) {
      await removeAllergenKeyFromPlats(allergenKey)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allergens/bbdd/allergens/[key] DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

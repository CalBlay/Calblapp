export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  requireAllergensBbddEdit,
  requireAllergensModuleView,
} from '@/lib/server/allergensApiAuth'

type TaxonomyEntry = { id: string; label: string; source?: string }

export async function GET(
  _req: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAllergensModuleView()
    if (!auth.ok) return auth.res

    const { code } = await context.params
    const docId = String(code || '').trim()
    if (!docId) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const snap = await firestoreAdmin.collection('plats').doc(docId).get()
    if (!snap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ id: snap.id, ...snap.data() })
  } catch (error) {
    console.error('[allergens/bbdd/plats/[code] GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    const { code } = await context.params
    const docId = String(code || '').trim()
    if (!docId) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const body = (await req.json()) as {
      payload: Record<string, unknown>
      taxonomy?: {
        category?: TaxonomyEntry | null
        family?: TaxonomyEntry | null
        menu?: TaxonomyEntry | null
      }
    }

    const payload = {
      ...body.payload,
      updatedAt: Timestamp.now(),
    }

    await firestoreAdmin.collection('plats').doc(docId).set(payload, { merge: true })

    const taxonomy = body.taxonomy || {}
    const writes: Promise<unknown>[] = []

    if (taxonomy.category?.id) {
      writes.push(
        firestoreAdmin
          .collection('categories')
          .doc(taxonomy.category.id)
          .set(
            {
              label: taxonomy.category.label,
              updatedAt: Timestamp.now(),
              source: taxonomy.category.source || 'manual',
            },
            { merge: true }
          )
      )
    }

    if (taxonomy.family?.id) {
      writes.push(
        firestoreAdmin
          .collection('family')
          .doc(taxonomy.family.id)
          .set(
            {
              label: taxonomy.family.label,
              updatedAt: Timestamp.now(),
              source: taxonomy.family.source || 'manual',
            },
            { merge: true }
          )
      )
    }

    if (taxonomy.menu?.id) {
      writes.push(
        firestoreAdmin
          .collection('menus')
          .doc(taxonomy.menu.id)
          .set(
            {
              label: taxonomy.menu.label,
              updatedAt: Timestamp.now(),
              source: taxonomy.menu.source || 'manual',
            },
            { merge: true }
          )
      )
    }

    if (writes.length) await Promise.all(writes)

    return NextResponse.json({ ok: true, id: docId })
  } catch (error) {
    console.error('[allergens/bbdd/plats/[code] PUT]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    const { code } = await context.params
    const docId = String(code || '').trim()
    if (!docId) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    const updates = (await req.json()) as Record<string, unknown>
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    await firestoreAdmin
      .collection('plats')
      .doc(docId)
      .set({ ...updates, updatedAt: Timestamp.now() }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allergens/bbdd/plats/[code] PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    const { code } = await context.params
    const docId = String(code || '').trim()
    if (!docId) {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    }

    await firestoreAdmin.collection('plats').doc(docId).delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allergens/bbdd/plats/[code] DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

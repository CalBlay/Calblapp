export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAllergensBbddEdit } from '@/lib/server/allergensApiAuth'
import { DEFAULT_ALLERGENS } from '@/data/allergens'

export async function POST() {
  try {
    const auth = await requireAllergensBbddEdit()
    if (!auth.ok) return auth.res

    await Promise.all(
      DEFAULT_ALLERGENS.map((allergen) =>
        firestoreAdmin
          .collection('allergens')
          .doc(allergen.key)
          .set(
            { label: allergen.label, updatedAt: Timestamp.now(), source: 'default' },
            { merge: true }
          )
      )
    )

    return NextResponse.json({ ok: true, count: DEFAULT_ALLERGENS.length })
  } catch (error) {
    console.error('[allergens/bbdd/allergens/seed POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

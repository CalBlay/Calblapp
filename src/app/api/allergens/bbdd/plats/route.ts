export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import { requireAllergensModuleView } from '@/lib/server/allergensApiAuth'

/** Llista completa de plats (export). */
export async function GET() {
  try {
    const auth = await requireAllergensModuleView()
    if (!auth.ok) return auth.res

    const snap = await firestoreAdmin.collection('plats').get()
    const plats = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      code: docSnap.data().code || docSnap.id,
    }))

    return NextResponse.json({ plats })
  } catch (error) {
    console.error('[allergens/bbdd/plats GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

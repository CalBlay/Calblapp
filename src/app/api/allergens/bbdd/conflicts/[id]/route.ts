export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { firestoreAdmin } from '@/lib/firebaseAdmin'
import {
  requireAllergensBbddView,
  requireAllergensImportOrReplace,
} from '@/lib/server/allergensApiAuth'

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAllergensBbddView()
    if (!auth.ok) return auth.res

    const denied = await requireAllergensImportOrReplace(auth)
    if (denied) return denied.res

    const { id } = await context.params
    const conflictId = String(id || '').trim()
    if (!conflictId) {
      return NextResponse.json({ ok: false, error: 'Missing conflict id' }, { status: 400 })
    }

    await firestoreAdmin.collection('allergens_import_conflicts').doc(conflictId).delete()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[allergens/bbdd/conflicts DELETE]', error)
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 })
  }
}

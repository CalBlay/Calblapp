export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { canManageDocumentacioContent, type DocumentacioItemRecord } from '@/lib/documentacio-access'
import { DOCUMENTACIO_ITEMS_SEARCH_TAG } from '@/lib/documentacio-cache'

const COLLECTION = 'documentacio_items'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  if (!canManageDocumentacioContent(auth.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const docId = String(id || '').trim()
  if (!docId) {
    return NextResponse.json({ error: 'Id invàlid' }, { status: 400 })
  }

  const ref = db.collection(COLLECTION).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) {
    return NextResponse.json({ error: 'No trobat' }, { status: 404 })
  }

  const data = snap.data() as DocumentacioItemRecord
  if (data.storagePath) {
    try {
      await storageAdmin.bucket().file(data.storagePath).delete({ ignoreNotFound: true })
    } catch {
      /* continuar esborrant el document */
    }
  }

  await ref.delete()
  revalidateTag(DOCUMENTACIO_ITEMS_SEARCH_TAG)
  return NextResponse.json({ ok: true })
}

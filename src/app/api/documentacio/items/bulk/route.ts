export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import { canManageDocumentacioContent, type DocumentacioItemRecord } from '@/lib/documentacio-access'
import { DOCUMENTACIO_ITEMS_SEARCH_TAG } from '@/lib/documentacio-cache'
import { isValidDocumentacioAmbitSlug, isValidDocumentacioTopicSlug } from '@/lib/documentacio-structure'

const COLLECTION = 'documentacio_items'
const BATCH_SIZE = 450

/**
 * Esborra tots els documents Firestore d’un àmbit, o d’un tema dins l’àmbit (query `topicSlug`).
 * No modifica fitxers estàtics definits al codi.
 */
export async function DELETE(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  if (!canManageDocumentacioContent(auth.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const ambit = String(searchParams.get('ambit') || '').trim()
  const topicSlugRaw = String(searchParams.get('topicSlug') || '').trim()

  if (!isValidDocumentacioAmbitSlug(ambit)) {
    return NextResponse.json({ error: 'Àmbit no vàlid' }, { status: 400 })
  }

  const topicSlug = topicSlugRaw || null
  if (topicSlug && !isValidDocumentacioTopicSlug(topicSlug)) {
    return NextResponse.json({ error: 'Tema no vàlid' }, { status: 400 })
  }

  let query: FirebaseFirestore.Query = db.collection(COLLECTION).where('ambit', '==', ambit)
  if (topicSlug) {
    query = query.where('topicSlug', '==', topicSlug)
  }

  const snap = await query.get()
  const docs = snap.docs

  for (const doc of docs) {
    const data = doc.data() as DocumentacioItemRecord
    if (data.storagePath) {
      try {
        await storageAdmin.bucket().file(data.storagePath).delete({ ignoreNotFound: true })
      } catch {
        /* continuar */
      }
    }
  }

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    for (const doc of docs.slice(i, i + BATCH_SIZE)) {
      batch.delete(doc.ref)
    }
    await batch.commit()
  }

  revalidateTag(DOCUMENTACIO_ITEMS_SEARCH_TAG)
  return NextResponse.json({ ok: true, deleted: docs.length })
}

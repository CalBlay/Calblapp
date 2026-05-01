export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import {
  isStaticDocumentacioAmbit,
  isValidDocumentacioAmbitSlug,
} from '@/lib/documentacio-structure'

const COLLECTION = 'documentacio_items'

/**
 * Àmbits addicionals (no són formacions / normatives / protocols) amb documents a Firestore.
 */
export async function GET() {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const snap = await db.collection(COLLECTION).select('ambit', 'ambitTitle', 'updatedAt').get()

  const meta = new Map<string, { title: string; updated: number }>()
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>
    const slug = String(data.ambit ?? '').trim()
    if (!slug || !isValidDocumentacioAmbitSlug(slug)) continue
    if (isStaticDocumentacioAmbit(slug)) continue
    const titleRaw = String(data.ambitTitle ?? '').trim()
    const title = titleRaw || slug
    const u = Number(data.updatedAt) || 0
    const prev = meta.get(slug)
    if (!prev || u >= prev.updated) meta.set(slug, { title, updated: u })
  }

  const extraAmbits = [...meta.entries()]
    .map(([slug, { title }]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ca', { sensitivity: 'base' }))

  return NextResponse.json({ extraAmbits })
}

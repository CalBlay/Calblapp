export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { requireAuth } from '@/lib/server/apiAuth'
import {
  getGroupsForAmbit,
  isStaticDocumentacioAmbit,
  isValidDocumentacioAmbitSlug,
  isValidDocumentacioTopicSlug,
} from '@/lib/documentacio-structure'

const COLLECTION = 'documentacio_items'

/**
 * Temes addicionals (no definits a l’estructura estàtica) que tenen documents a Firestore.
 */
export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const ambitRaw = String(searchParams.get('ambit') || '')
  if (!isValidDocumentacioAmbitSlug(String(ambitRaw || '').trim())) {
    return NextResponse.json({ error: 'Àmbit invàlid' }, { status: 400 })
  }
  const ambit = String(ambitRaw || '').trim()

  const staticGroups = isStaticDocumentacioAmbit(ambit) ? getGroupsForAmbit(ambit) : []
  const staticSlugs = new Set(staticGroups.flatMap((g) => g.topics.map((t) => t.slug)))

  const snap = await db
    .collection(COLLECTION)
    .where('ambit', '==', ambit)
    .select('topicSlug', 'topicTitle', 'updatedAt')
    .get()

  const dynamicMeta = new Map<string, { title: string; updated: number }>()
  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>
    const slug = String(data.topicSlug ?? '').trim()
    if (!slug || !isValidDocumentacioTopicSlug(slug)) continue
    if (staticSlugs.has(slug)) continue
    const titleRaw = String(data.topicTitle ?? '').trim()
    const title = titleRaw || slug
    const u = Number(data.updatedAt) || 0
    const prev = dynamicMeta.get(slug)
    if (!prev || u >= prev.updated) dynamicMeta.set(slug, { title, updated: u })
  }

  const extraTopics = [...dynamicMeta.entries()]
    .map(([slug, { title }]) => ({ slug, title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ca', { sensitivity: 'base' }))

  return NextResponse.json({ extraTopics })
}

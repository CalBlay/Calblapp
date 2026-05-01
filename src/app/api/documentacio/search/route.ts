export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/server/apiAuth'
import { documentacioItemVisibleToViewer, normalizeForSearch } from '@/lib/documentacio-access'
import { getCachedDocumentacioItemsForSearch } from '@/lib/documentacio-cache'
import {
  getAmbitDisplayTitle,
  getDocumentacioSearchIndex,
  isValidDocumentacioAmbitSlug,
} from '@/lib/documentacio-structure'
import type { DocumentacioSearchResult } from '@/lib/documentacio-search'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(req.url)
  const qRaw = String(searchParams.get('q') || '').trim()
  if (!qRaw) {
    return NextResponse.json({ results: [] as DocumentacioSearchResult[] })
  }

  const q = normalizeForSearch(qRaw)
  if (!q) {
    return NextResponse.json({ results: [] as DocumentacioSearchResult[] })
  }

  const role = auth.role
  const department = auth.user.department || ''

  const topicIndex = getDocumentacioSearchIndex()
  const topicTitleByKey = new Map<string, string>(topicIndex.map((h) => [`${h.ambit}|${h.topicSlug}`, h.topicTitle]))

  const results: DocumentacioSearchResult[] = []
  const seenTopic = new Set<string>()
  const seenDoc = new Set<string>()

  for (const hit of topicIndex) {
    const hay = normalizeForSearch(`${hit.topicTitle} ${hit.ambitTitle} ${hit.groupTitle}`)
    if (!hay.includes(q)) continue
    const key = `${hit.ambit}|${hit.topicSlug}`
    if (seenTopic.has(key)) continue
    seenTopic.add(key)
    if (!isValidDocumentacioAmbitSlug(hit.ambit)) continue
    results.push({
      type: 'topic',
      title: hit.topicTitle,
      ambit: hit.ambit,
      ambitTitle: hit.ambitTitle,
      topicSlug: hit.topicSlug,
      href: hit.href,
    })
  }

  const items = await getCachedDocumentacioItemsForSearch()

  for (const item of items) {
    if (
      !documentacioItemVisibleToViewer({
        item,
        viewerRole: role,
        viewerDepartment: department,
      })
    ) {
      continue
    }
    if (!isValidDocumentacioAmbitSlug(item.ambit)) continue
    const ambit = item.ambit
    const topicTitle =
      topicTitleByKey.get(`${item.ambit}|${item.topicSlug}`) ||
      (item.topicTitle && String(item.topicTitle).trim()) ||
      item.topicSlug
    const ambitTitle = getAmbitDisplayTitle(ambit, item.ambitTitle)
    const hay = normalizeForSearch(`${item.label} ${ambitTitle} ${topicTitle} ${item.topicSlug}`)
    if (!hay.includes(q)) continue
    if (seenDoc.has(item.id)) continue
    seenDoc.add(item.id)
    results.push({
      type: 'document',
      id: item.id,
      label: item.label,
      ambit,
      ambitTitle,
      topicSlug: item.topicSlug,
      topicTitle,
      href: item.href,
      kind: item.kind,
    })
  }

  results.sort((a, b) => {
    const at = a.type === 'topic' ? a.title : a.label
    const bt = b.type === 'topic' ? b.title : b.label
    return at.localeCompare(bt, 'ca', { sensitivity: 'base' })
  })

  return NextResponse.json({ results: results.slice(0, 40) })
}

import { unstable_cache } from 'next/cache'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type { DocumentacioItemSearchRow } from '@/lib/documentacio-access'

/** Invalidar amb `revalidateTag` després de POST/DELETE a `documentacio_items`. */
export const DOCUMENTACIO_ITEMS_SEARCH_TAG = 'documentacio_items_search'

const COLLECTION = 'documentacio_items'

function normalizeSearchRow(docId: string, data: Record<string, unknown>): DocumentacioItemSearchRow {
  const topicTitleRaw = String(data.topicTitle ?? '').trim()
  const ambitTitleRaw = String(data.ambitTitle ?? '').trim()
  return {
    id: docId,
    label: String(data.label ?? ''),
    ambit: String(data.ambit ?? ''),
    ambitTitle: ambitTitleRaw || null,
    topicSlug: String(data.topicSlug ?? ''),
    topicTitle: topicTitleRaw || null,
    kind: data.kind === 'link' ? 'link' : 'file',
    href: String(data.href ?? ''),
    status: data.status === 'draft' ? 'draft' : 'published',
    departments: Array.isArray(data.departments) ? data.departments.map(String) : [],
    roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
  }
}

/**
 * Lectura agrupada per al buscador: evita un `get()` complet a cada consulta.
 * Només camps necessaris per visibilitat + text de cerca (menys egress Firestore).
 */
async function loadAllItemsForSearch(): Promise<DocumentacioItemSearchRow[]> {
  const snap = await db
    .collection(COLLECTION)
    .select(
      'label',
      'ambit',
      'ambitTitle',
      'topicSlug',
      'topicTitle',
      'kind',
      'href',
      'status',
      'departments',
      'roles'
    )
    .get()

  return snap.docs.map((doc) => normalizeSearchRow(doc.id, doc.data()))
}

export const getCachedDocumentacioItemsForSearch = unstable_cache(
  loadAllItemsForSearch,
  ['documentacio_items_search_v1'],
  { revalidate: 180, tags: [DOCUMENTACIO_ITEMS_SEARCH_TAG] }
)

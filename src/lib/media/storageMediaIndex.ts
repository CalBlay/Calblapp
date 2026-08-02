import { firestoreAdmin as db, storageAdmin } from '@/lib/firebaseAdmin'
import type { AggregatedMediaItem, MediaRef, MediaSource } from '@/lib/media/collectMediaRefs'
import {
  cleanText,
  collectAllMediaRefs,
  extractOwnedStoragePath,
  mediaIndexDocId,
  mediaRefKey,
  mergeContextField,
} from '@/lib/media/collectMediaRefs'
import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'

const COLLECTION = 'media_storage_index'

type IndexDoc = {
  path: string
  url: string | null
  size: number | null
  contentType: string | null
  createdAt: number
  updatedAt: number
  title: string
  sourceKinds: MediaSource[]
  referenceCount: number
  refMap: Record<string, boolean>
  auditEventId: string | null
  auditDepartment: string | null
  auditItemId: string | null
  auditRunId: string | null
  incidentEventId: string | null
  eventEventId: string | null
}

function indexDocToAggregated(d: QueryDocumentSnapshot): AggregatedMediaItem {
  const x = d.data() as Partial<IndexDoc>
  return {
    id: x.path || d.id,
    indexDocId: d.id,
    path: x.path || '',
    url: x.url ?? null,
    createdAt: x.createdAt || 0,
    size: x.size ?? null,
    type: x.contentType ?? null,
    sourceKinds: (x.sourceKinds || []) as MediaSource[],
    referenceCount: x.referenceCount || 0,
    title: x.title || x.path || '',
    auditEventId: x.auditEventId ?? null,
    auditDepartment: x.auditDepartment ?? null,
    auditItemId: x.auditItemId ?? null,
    auditRunId: x.auditRunId ?? null,
    incidentEventId: x.incidentEventId ?? null,
    eventEventId: x.eventEventId ?? null,
  }
}

function pickBetterSize(a: number | null | undefined, b: number | null | undefined): number | null {
  const n = (v: number | null | undefined) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
  return n(a) ?? n(b) ?? null
}

export async function registerMediaRef(params: {
  path: string
  source: MediaSource
  firestoreDocId: string
  refSuffix?: string
  url?: string | null
  size?: number | null
  contentType?: string | null
  title?: string
  createdAt?: number
  auditEventId?: string | null
  auditDepartment?: string | null
  auditItemId?: string | null
  auditRunId?: string | null
  incidentEventId?: string | null
  eventEventId?: string | null
}): Promise<void> {
  const path = String(params.path || '').trim()
  if (!path) return

  const ref: Pick<MediaRef, 'source' | 'docId' | 'refSuffix'> = {
    source: params.source,
    docId: params.firestoreDocId,
    refSuffix: params.refSuffix,
  }
  const refKey = mediaRefKey(ref)
  const id = mediaIndexDocId(path)
  const refDoc = db.collection(COLLECTION).doc(id)
  const now = Date.now()

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(refDoc)
    const prev = snap.exists ? (snap.data() as IndexDoc) : null
    const refMap = { ...(prev?.refMap || {}) }
    if (refMap[refKey]) {
      return
    }
    refMap[refKey] = true
    const kinds = new Set<MediaSource>(prev?.sourceKinds || [])
    kinds.add(params.source)
    const referenceCount = Object.keys(refMap).length

    const next: IndexDoc = {
      path,
      url: params.url ?? prev?.url ?? null,
      size: pickBetterSize(params.size, prev?.size),
      contentType: params.contentType ?? prev?.contentType ?? null,
      title: (params.title && params.title.trim()) || prev?.title || path,
      createdAt: prev?.createdAt || params.createdAt || now,
      updatedAt: now,
      sourceKinds: Array.from(kinds),
      referenceCount,
      refMap,
      auditEventId: mergeContextField(prev?.auditEventId, params.auditEventId),
      auditDepartment: mergeContextField(prev?.auditDepartment, params.auditDepartment),
      auditItemId: mergeContextField(prev?.auditItemId, params.auditItemId),
      auditRunId: mergeContextField(prev?.auditRunId, params.auditRunId),
      incidentEventId: mergeContextField(prev?.incidentEventId, params.incidentEventId),
      eventEventId: mergeContextField(prev?.eventEventId, params.eventEventId),
    }
    tx.set(refDoc, next)
  })
}

export async function deleteMediaIndexByPath(path: string): Promise<void> {
  const p = String(path || '').trim()
  if (!p) return
  await db.collection(COLLECTION).doc(mediaIndexDocId(p)).delete().catch(() => {})
}

/** Esborra tots els documents de l’índex (per reindexació). */
export async function clearMediaIndexBatched(): Promise<void> {
  const coll = db.collection(COLLECTION)
  for (;;) {
    const snap = await coll.limit(400).get()
    if (snap.empty) break
    const batch = db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

export async function rebuildMediaIndexFromFirestore(): Promise<{ entries: number; refs: number }> {
  await clearMediaIndexBatched()
  const flat = await collectAllMediaRefs()
  const coll = db.collection(COLLECTION)

  const byPath = new Map<
    string,
    {
      path: string
      url: string | null
      size: number | null
      contentType: string | null
      title: string
      createdAt: number
      refMap: Record<string, boolean>
      kinds: Set<MediaSource>
      auditEventId: string | null
      auditDepartment: string | null
      auditItemId: string | null
      auditRunId: string | null
      incidentEventId: string | null
      eventEventId: string | null
    }
  >()

  for (const r of flat) {
    const rk = mediaRefKey(r)
    let row = byPath.get(r.path)
    if (!row) {
      row = {
        path: r.path,
        url: r.url,
        size: r.size,
        contentType: r.type,
        title: r.title,
        createdAt: r.createdAt,
        refMap: {},
        kinds: new Set(),
        auditEventId: null,
        auditDepartment: null,
        auditItemId: null,
        auditRunId: null,
        incidentEventId: null,
        eventEventId: null,
      }
      byPath.set(r.path, row)
    }
    row.refMap[rk] = true
    row.kinds.add(r.source)
    if (!row.url && r.url) row.url = r.url
    row.size = pickBetterSize(r.size, row.size)
    if (!row.contentType && r.type) row.contentType = r.type
    if (r.createdAt > row.createdAt) row.createdAt = r.createdAt
    if (r.title) row.title = r.title
    row.auditEventId = mergeContextField(row.auditEventId, r.auditEventId)
    row.auditDepartment = mergeContextField(row.auditDepartment, r.auditDepartment)
    row.auditItemId = mergeContextField(row.auditItemId, r.auditItemId)
    row.auditRunId = mergeContextField(row.auditRunId, r.auditRunId)
    row.incidentEventId = mergeContextField(row.incidentEventId, r.incidentEventId)
    row.eventEventId = mergeContextField(row.eventEventId, r.eventEventId)
  }

  const now = Date.now()
  const docs = Array.from(byPath.values())
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    const chunk = docs.slice(i, i + 400)
    for (const row of chunk) {
      const docRef = coll.doc(mediaIndexDocId(row.path))
      const payload: IndexDoc = {
        path: row.path,
        url: row.url,
        size: row.size,
        contentType: row.contentType,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: now,
        sourceKinds: Array.from(row.kinds),
        referenceCount: Object.keys(row.refMap).length,
        refMap: row.refMap,
        auditEventId: row.auditEventId,
        auditDepartment: row.auditDepartment,
        auditItemId: row.auditItemId,
        auditRunId: row.auditRunId,
        incidentEventId: row.incidentEventId,
        eventEventId: row.eventEventId,
      }
      batch.set(docRef, payload)
    }
    await batch.commit()
  }

  return { entries: docs.length, refs: flat.length }
}

export async function loadAllMediaFromIndex(maxDocs = 8000): Promise<AggregatedMediaItem[]> {
  const coll = db.collection(COLLECTION)
  const out: AggregatedMediaItem[] = []
  let last: QueryDocumentSnapshot | null = null

  while (out.length < maxDocs) {
    let q = coll.orderBy('createdAt', 'desc').limit(Math.min(500, maxDocs - out.length))
    if (last) q = q.startAfter(last)
    const snap = await q.get()
    if (snap.empty) break
    for (const d of snap.docs) {
      out.push(indexDocToAggregated(d))
    }
    last = snap.docs[snap.docs.length - 1]
    if (snap.size < 500) break
  }

  return out.sort((a, b) => b.createdAt - a.createdAt)
}

const DEFAULT_PAGE_SIZE = 60
const MAX_PAGE_SIZE = 200

export async function loadMediaIndexPage(params: {
  limit?: number
  cursor?: string | null
  source?: MediaSource | null
  auditEventId?: string | null
  incidentEventId?: string | null
  eventEventId?: string | null
}): Promise<{ items: AggregatedMediaItem[]; nextCursor: string | null }> {
  const coll = db.collection(COLLECTION)
  const limit = Math.min(
    Math.max(typeof params.limit === 'number' && Number.isFinite(params.limit) ? params.limit : DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  )
  const auditEv = cleanText(params.auditEventId)
  const incidentEv = cleanText(params.incidentEventId)
  const eventEv = cleanText(params.eventEventId)
  const source = params.source

  let q: Query = coll
  if (auditEv) {
    q = q.where('auditEventId', '==', auditEv)
  } else if (incidentEv) {
    q = q.where('incidentEventId', '==', incidentEv)
  } else if (eventEv) {
    q = q.where('eventEventId', '==', eventEv)
  } else if (source) {
    q = q.where('sourceKinds', 'array-contains', source)
  }

  q = q.orderBy('createdAt', 'desc').limit(limit + 1)

  const cursor = cleanText(params.cursor)
  if (cursor) {
    const cur = await coll.doc(cursor).get()
    if (cur.exists) q = q.startAfter(cur)
  }

  const snap = await q.get()
  const docs = snap.docs
  const hasMore = docs.length > limit
  const pageDocs = hasMore ? docs.slice(0, limit) : docs
  const items = pageDocs.map((d) => indexDocToAggregated(d))
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null

  return { items, nextCursor }
}

/** Si l’índex està buit, retorna false. */
export async function isMediaIndexEmpty(): Promise<boolean> {
  const snap = await db.collection(COLLECTION).limit(1).get()
  return snap.empty
}

/** Registra fotos d’una auditoria (mateixa semàntica que collectAuditRefs). */
export async function registerAuditAnswersInIndex(
  runId: string,
  answers: Array<{
    itemId?: string
    photos?: Array<{ url?: string; path?: string; size?: number; type?: string }>
  }>,
  meta: {
    templateName?: string | null
    eventTitle?: string | null
    createdAt?: number
    eventId?: string | null
    department?: string | null
  }
): Promise<void> {
  const templateName = cleanText(meta.templateName)
  const eventTitle = cleanText(meta.eventTitle)
  const createdAt = meta.createdAt ?? Date.now()
  const titleBase = [templateName, eventTitle].filter(Boolean).join(' · ')
  const auditEventId = cleanText(meta.eventId)
  const auditDepartment = cleanText(meta.department)

  for (const answer of answers) {
    const itemId = cleanText(answer.itemId)
    const photos = Array.isArray(answer.photos) ? answer.photos : []
    photos.forEach((photo, index) => {
      const path = cleanText(photo.path)
      if (!path) return
      const title = [titleBase, `Foto ${index + 1}`].filter(Boolean).join(' · ') || `Auditoria ${runId}`
      const size =
        typeof photo.size === 'number' && Number.isFinite(photo.size) && photo.size > 0 ? photo.size : null
      const contentType = cleanText(photo.type) || null
      void registerMediaRef({
        path,
        source: 'audits',
        firestoreDocId: runId,
        refSuffix: `${itemId || 'item'}_${index}`,
        url: cleanText(photo.url) || null,
        size,
        contentType,
        title,
        createdAt,
        auditEventId: auditEventId || null,
        auditDepartment: auditDepartment || null,
        auditItemId: itemId || null,
        auditRunId: runId,
      })
    })
  }
}

/** URLs de producció (finques): extreu path del bucket i registra com a spaces. */
export async function registerFinquesProduccioImagesInIndex(
  fincaId: string,
  args: { nom?: string; code?: string; images: string[]; createdAt?: number }
): Promise<void> {
  await registerFinquesProduccioMediaInIndex(fincaId, {
    nom: args.nom,
    code: args.code,
    createdAt: args.createdAt,
    media: args.images.map((url) => ({ kind: 'image' as const, url })),
  })
}

export async function registerFinquesProduccioMediaInIndex(
  fincaId: string,
  args: {
    nom?: string
    code?: string
    createdAt?: number
    media: Array<{ kind: string; url: string }>
  }
): Promise<void> {
  const bucketName = storageAdmin.bucket().name
  const now = args.createdAt ?? Date.now()
  const nom = cleanText(args.nom)
  const code = cleanText(args.code)

  args.media.forEach((item, index) => {
    const url = cleanText(item.url)
    const path = extractOwnedStoragePath(url, bucketName)
    if (!path) return
    const kind = cleanText(item.kind).toLowerCase()
    const label =
      kind === 'video' ? `Vídeo ${index + 1}` : kind === 'google-photos' ? `Google Fotos ${index + 1}` : `Imatge ${index + 1}`
    const title =
      [nom, code, label].filter(Boolean).join(' · ') || `Espai ${fincaId}`
    void registerMediaRef({
      path,
      source: 'spaces',
      firestoreDocId: fincaId,
      refSuffix: `${kind || 'img'}_${index}`,
      url,
      title,
      createdAt: now,
    })
  })
}

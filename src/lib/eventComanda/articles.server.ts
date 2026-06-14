import type { Query, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import type { ParsedErpLine } from '@/lib/eventComanda/parseErpExcel'
import { eventComandaQtyUnit } from '@/lib/eventComanda/parseErpExcel'
import {
  listEventComandaWarehouseRules,
  resolveWarehouseIdForArticleCode,
} from '@/lib/eventComanda/warehouseRules.server'
import { getWarehouseById, listEventComandaWarehouses } from '@/lib/eventComanda/warehouses.server'
import { resolveEventComandaUnitCode } from '@/lib/eventComanda/units.server'

const COL = EVENT_COMANDA_COLLECTIONS.articles
const BATCH_LIMIT = 400
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const SEARCH_MIN_LEN = 2

export const normalizeArticleSearchText = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const articleNameSearchKey = (name: string) => normalizeArticleSearchText(name)

export type EventComandaArticleWarehouseSource = 'prefix' | 'manual' | 'import'

export const articleDocId = (code: string) =>
  String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[/\\]/g, '_')

export async function upsertArticlesFromLines(
  lines: ParsedErpLine[],
  userId?: string
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  const now = Date.now()
  const rules = await listEventComandaWarehouseRules()

  const uniqueByCode = new Map<string, ParsedErpLine>()
  for (const line of lines) {
    const id = articleDocId(line.articleCode)
    if (!id) continue
    uniqueByCode.set(id, line)
  }

  const entries = [...uniqueByCode.entries()]
  for (let offset = 0; offset < entries.length; offset += BATCH_LIMIT) {
    const chunk = entries.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map(([id]) => db.collection(COL).doc(id))
    const snaps = await db.getAll(...refs)
    const existingById = new Map(
      snaps.map((s) => [
        s.id,
        s.exists ? (s.data() as { warehouseId?: string; warehouseSource?: string }) : null,
      ])
    )

    const batch = db.batch()
    for (const [id, line] of chunk) {
      const ref = db.collection(COL).doc(id)
      const existing = existingById.get(id)
      const resolvedWarehouseId = resolveWarehouseIdForArticleCode(line.articleCode, rules)
      const keepManualWarehouse =
        existing?.warehouseSource === 'manual' && Boolean(existing.warehouseId)

      const payload: Record<string, unknown> = {
        code: line.articleCode,
        name: line.articleName,
        nameSearch: articleNameSearchKey(line.articleName),
        family: line.family,
        unit: eventComandaQtyUnit(line.qtyUnit),
        isActive: true,
        lastSeenAt: now,
        updatedAt: now,
        updatedByUserId: userId || null,
      }

      if (keepManualWarehouse) {
        payload.warehouseId = existing?.warehouseId
        payload.warehouseSource = 'manual'
      } else if (resolvedWarehouseId) {
        payload.warehouseId = resolvedWarehouseId
        payload.warehouseSource = 'prefix'
      }

      if (existing) {
        batch.set(
          ref,
          { ...payload, usageCount: FieldValue.increment(1) },
          { merge: true }
        )
        updated += 1
      } else {
        batch.set(ref, {
          ...payload,
          usageCount: 1,
          createdAt: now,
          createdByUserId: userId || null,
        })
        created += 1
      }
    }
    await batch.commit()
  }

  return { created, updated }
}

export type ResolveArticleInput = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit?: string
}

export type ResolvedArticleRecord = {
  articleCode: string
  warehouseId: string | null
  warehouseCode: string | null
  warehouseName: string | null
  created: boolean
}

const MAX_RESOLVE_CODES = 5000

export async function resolveEventComandaArticlesByCodes(
  lines: ResolveArticleInput[],
  options?: { userId?: string; createMissing?: boolean }
): Promise<{ articles: ResolvedArticleRecord[]; created: number }> {
  const createMissing = options?.createMissing !== false
  const userId = options?.userId
  const now = Date.now()

  const uniqueByCode = new Map<string, ResolveArticleInput>()
  for (const line of lines) {
    const id = articleDocId(line.articleCode)
    if (!id) continue
    uniqueByCode.set(id, {
      articleCode: String(line.articleCode || '').trim().toUpperCase(),
      articleName: String(line.articleName || '').trim(),
      family: String(line.family || '').trim(),
      qtyUnit: eventComandaQtyUnit(line.qtyUnit),
    })
  }

  const entries = [...uniqueByCode.entries()].slice(0, MAX_RESOLVE_CODES)
  if (entries.length === 0) {
    return { articles: [], created: 0 }
  }

  const [rules, warehouses] = await Promise.all([
    listEventComandaWarehouseRules(),
    listEventComandaWarehouses(),
  ])
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]))

  let created = 0
  const articleDataByCode = new Map<
    string,
    { warehouseId: string | null; created: boolean }
  >()

  for (let offset = 0; offset < entries.length; offset += BATCH_LIMIT) {
    const chunk = entries.slice(offset, offset + BATCH_LIMIT)
    const refs = chunk.map(([id]) => db.collection(COL).doc(id))
    const snaps = await db.getAll(...refs)
    const existingById = new Map(
      snaps.map((s) => [
        s.id,
        s.exists
          ? (s.data() as { code?: string; warehouseId?: string; warehouseSource?: string })
          : null,
      ])
    )

    const batch = db.batch()
    let batchHasWrites = false

    for (const [id, line] of chunk) {
      const existing = existingById.get(id)
      const code = line.articleCode

      if (existing) {
        let warehouseId = existing.warehouseId
          ? String(existing.warehouseId).trim().toUpperCase()
          : null
        if (!warehouseId) {
          warehouseId = resolveWarehouseIdForArticleCode(code, rules)
        }
        articleDataByCode.set(code, { warehouseId, created: false })
        continue
      }

      if (!createMissing) {
        const resolvedWarehouseId = resolveWarehouseIdForArticleCode(code, rules)
        articleDataByCode.set(code, { warehouseId: resolvedWarehouseId, created: false })
        continue
      }

      const resolvedWarehouseId = resolveWarehouseIdForArticleCode(code, rules)
      const ref = db.collection(COL).doc(id)
      const payload: Record<string, unknown> = {
        code,
        name: line.articleName,
        nameSearch: articleNameSearchKey(line.articleName),
        family: line.family,
        unit: eventComandaQtyUnit(line.qtyUnit),
        isActive: true,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId || null,
        updatedByUserId: userId || null,
        usageCount: 1,
      }
      if (resolvedWarehouseId) {
        payload.warehouseId = resolvedWarehouseId
        payload.warehouseSource = 'prefix'
      }
      batch.set(ref, payload)
      batchHasWrites = true
      created += 1
      articleDataByCode.set(code, { warehouseId: resolvedWarehouseId, created: true })
    }

    if (batchHasWrites) {
      await batch.commit()
    }
  }

  const articles: ResolvedArticleRecord[] = entries.map(([, line]) => {
    const code = line.articleCode
    const data = articleDataByCode.get(code)
    const warehouseId = data?.warehouseId ?? null
    const warehouse = warehouseId ? warehouseById.get(warehouseId) : null
    return {
      articleCode: code,
      warehouseId,
      warehouseCode: warehouse?.code ?? warehouseId,
      warehouseName: warehouse?.name ?? null,
      created: data?.created ?? false,
    }
  })

  return { articles, created }
}

export type EventComandaArticleRecord = {
  articleCode: string
  articleName: string
  family: string
  qtyUnit: string
  warehouseId?: string | null
  warehouseCode?: string | null
  warehouseName?: string | null
  warehouseSource?: EventComandaArticleWarehouseSource | null
  erpGroupCode?: string | null
  erpGroupName?: string | null
  erpFamilyCode?: string | null
  erpFamilyName?: string | null
  erpSubfamilyCode?: string | null
  erpSubfamilyName?: string | null
}

type ArticleDocData = {
  code?: string
  name?: string
  family?: string
  unit?: string
  isActive?: boolean
  warehouseId?: string
  warehouseSource?: EventComandaArticleWarehouseSource
  erpGroupCode?: string
  erpGroupName?: string
  erpFamilyCode?: string
  erpFamilyName?: string
  erpSubfamilyCode?: string
  erpSubfamilyName?: string
}

const mapArticleFromDoc = (
  doc: QueryDocumentSnapshot,
  warehouseById: Map<string, { code: string; name: string }>
): EventComandaArticleRecord | null => {
  const data = doc.data() as ArticleDocData
  if (data.isActive === false) return null
  const articleCode = String(data.code || doc.id).trim().toUpperCase()
  if (!articleCode) return null

  const warehouseId = data.warehouseId ? String(data.warehouseId).trim().toUpperCase() : null
  const warehouse = warehouseId ? warehouseById.get(warehouseId) : null

  return {
    articleCode,
    articleName: String(data.name || '').trim(),
    family: String(data.family || '').trim(),
    qtyUnit: eventComandaQtyUnit(data.unit),
    warehouseId,
    warehouseCode: warehouse?.code ?? warehouseId,
    warehouseName: warehouse?.name ?? null,
    warehouseSource: data.warehouseSource ?? null,
    erpGroupCode: data.erpGroupCode ? String(data.erpGroupCode).trim() : null,
    erpGroupName: data.erpGroupName ? String(data.erpGroupName).trim() : null,
    erpFamilyCode: data.erpFamilyCode ? String(data.erpFamilyCode).trim() : null,
    erpFamilyName: data.erpFamilyName ? String(data.erpFamilyName).trim() : null,
    erpSubfamilyCode: data.erpSubfamilyCode ? String(data.erpSubfamilyCode).trim() : null,
    erpSubfamilyName: data.erpSubfamilyName ? String(data.erpSubfamilyName).trim() : null,
  }
}

export type EventComandaArticlesQueryResult = {
  articles: EventComandaArticleRecord[]
  nextCursor: string | null
}

export async function queryEventComandaArticles(params?: {
  q?: string
  limit?: number
  cursor?: string
}): Promise<EventComandaArticlesQueryResult> {
  const { listEventComandaWarehouses } = await import('@/lib/eventComanda/warehouses.server')
  const warehouses = await listEventComandaWarehouses()
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]))
  const mapDoc = (doc: QueryDocumentSnapshot) => mapArticleFromDoc(doc, warehouseById)

  const q = String(params?.q || '').trim()
  const limit = Math.min(Math.max(Number(params?.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)

  if (q.length >= SEARCH_MIN_LEN) {
    const codeTerm = q.toUpperCase()
    const nameTerm = normalizeArticleSearchText(q)
    const seen = new Set<string>()
    const merged: EventComandaArticleRecord[] = []

    const codeSnap = await db
      .collection(COL)
      .where('isActive', '==', true)
      .orderBy('code')
      .startAt(codeTerm)
      .endAt(`${codeTerm}\uf8ff`)
      .limit(limit)
      .get()

    for (const doc of codeSnap.docs) {
      const article = mapDoc(doc)
      if (!article) continue
      seen.add(article.articleCode)
      merged.push(article)
    }

    if (merged.length < limit && nameTerm) {
      try {
        const nameSnap = await db
          .collection(COL)
          .where('isActive', '==', true)
          .orderBy('nameSearch')
          .startAt(nameTerm)
          .endAt(`${nameTerm}\uf8ff`)
          .limit(limit)
          .get()

        for (const doc of nameSnap.docs) {
          const article = mapDoc(doc)
          if (!article || seen.has(article.articleCode)) continue
          seen.add(article.articleCode)
          merged.push(article)
          if (merged.length >= limit) break
        }
      } catch {
        // nameSearch index pot no existir fins al primer import; la cerca per codi segueix funcionant.
      }
    }

    merged.sort((a, b) => a.articleCode.localeCompare(b.articleCode))
    return { articles: merged.slice(0, limit), nextCursor: null }
  }

  let ref: Query = db
    .collection(COL)
    .where('isActive', '==', true)
    .orderBy('code')
    .limit(limit)

  if (params?.cursor) {
    const cursorSnap = await db.collection(COL).doc(articleDocId(params.cursor)).get()
    if (cursorSnap.exists) {
      ref = ref.startAfter(cursorSnap)
    }
  }

  const snap = await ref.get()
  const articles = snap.docs
    .map(mapDoc)
    .filter((article): article is EventComandaArticleRecord => article != null)

  const nextCursor =
    snap.docs.length === limit ? articles[articles.length - 1]?.articleCode ?? null : null

  return { articles, nextCursor }
}

/** @deprecated Usa queryEventComandaArticles amb paginació o cerca. */
export async function listEventComandaArticles(limit = DEFAULT_PAGE_SIZE): Promise<EventComandaArticleRecord[]> {
  const { articles } = await queryEventComandaArticles({ limit })
  return articles
}

export async function updateEventComandaArticle(
  id: string,
  params: {
    unit?: string
    warehouseId?: string | null
    userId?: string
  }
) {
  const docId = articleDocId(id)
  const ref = db.collection(COL).doc(docId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Article no trobat.')

  const patch: Record<string, unknown> = {
    updatedAt: Date.now(),
    updatedByUserId: params.userId || null,
  }

  if (params.unit !== undefined) {
    const normalized = eventComandaQtyUnit(params.unit)
    const resolved = await resolveEventComandaUnitCode(normalized, true)
    if (!resolved) {
      throw new Error(`La unitat "${normalized}" no existeix al catàleg o està inactiva.`)
    }
    patch.unit = resolved
  }

  if (params.warehouseId !== undefined) {
    const warehouseId = params.warehouseId
      ? String(params.warehouseId).trim().toUpperCase()
      : null
    if (warehouseId) {
      const warehouse = await getWarehouseById(warehouseId)
      if (!warehouse || !warehouse.isActive) throw new Error('Magatzem no vàlid.')
    }
    patch.warehouseId = warehouseId
    patch.warehouseSource = warehouseId ? 'manual' : null
  }

  await ref.set(patch, { merge: true })
  const updated = await ref.get()
  const data = updated.data() as Record<string, unknown>
  const warehouseId = data.warehouseId ? String(data.warehouseId) : null
  const warehouse = warehouseId ? await getWarehouseById(warehouseId) : null

  return {
    articleCode: String(data.code || docId).trim().toUpperCase(),
    articleName: String(data.name || '').trim(),
    family: String(data.family || '').trim(),
    qtyUnit: eventComandaQtyUnit(String(data.unit || '')),
    warehouseId,
    warehouseCode: warehouse?.code ?? warehouseId,
    warehouseName: warehouse?.name ?? null,
    warehouseSource: (data.warehouseSource as EventComandaArticleWarehouseSource | null) ?? null,
    erpGroupCode: data.erpGroupCode ? String(data.erpGroupCode).trim() : null,
    erpGroupName: data.erpGroupName ? String(data.erpGroupName).trim() : null,
    erpFamilyCode: data.erpFamilyCode ? String(data.erpFamilyCode).trim() : null,
    erpFamilyName: data.erpFamilyName ? String(data.erpFamilyName).trim() : null,
    erpSubfamilyCode: data.erpSubfamilyCode ? String(data.erpSubfamilyCode).trim() : null,
    erpSubfamilyName: data.erpSubfamilyName ? String(data.erpSubfamilyName).trim() : null,
  } satisfies EventComandaArticleRecord
}

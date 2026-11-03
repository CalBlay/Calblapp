import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import { listEventComandaWarehouses } from '@/lib/eventComanda/warehouses.server'
import type {
  PreparationArticleSelection,
  PreparationMissingArticle,
  PreparationWarehouseForm,
} from '@/lib/logistics/prepTypes'
import type { PreparationWarehouseCode } from '@/lib/logistics/preparationWarehouses'
import {
  preparationAvailableQuantity,
  preparationIntervalsOverlap,
} from '@/lib/logistics/preparationReservations'

const FORMS_COLLECTION = 'logistics_preparation_forms'
const RESERVATIONS_COLLECTION = 'logistics_preparation_reservations'
const ARTICLE_COLLECTION = EVENT_COMANDA_COLLECTIONS.articles
const SOURCE_COLLECTIONS = ['logistics_preparation_services', 'stage_verd'] as const

type SourceCollection = (typeof SOURCE_COLLECTIONS)[number]

type EventInterval = {
  startKey: string
  endKey: string
  startLabel: string
  endLabel: string
}

export type PreparationCatalogArticle = {
  articleCode: string
  articleName: string
  warehouseId: string
  warehouseName: string
  totalStock: number
  reservedStock: number
  availableStock: number
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function cleanCount(value: unknown) {
  const parsed = Math.floor(Number(value) || 0)
  return Math.min(Math.max(parsed, 0), 9999)
}

function normalizeSearch(value: unknown) {
  return cleanText(value, 200)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function preparationArticleMatchesSearch(
  article: { articleCode: unknown; articleName: unknown },
  query: unknown
) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true
  return normalizeSearch(`${article.articleCode ?? ''} ${article.articleName ?? ''}`)
    .includes(normalizedQuery)
}

function normalizeDate(value: unknown) {
  if (!value) return ''
  if (typeof value === 'string') {
    const raw = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const parsed = new Date(raw.replace(' ', 'T'))
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
  }
  return ''
}

function normalizeTime(value: unknown, fallback: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(cleanText(value, 20))
  if (!match) return fallback
  const hour = Math.min(Math.max(Number(match[1]), 0), 23)
  const minute = Math.min(Math.max(Number(match[2]), 0), 59)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function cleanSelections(value: unknown): PreparationArticleSelection[] {
  if (!Array.isArray(value)) return []
  const unique = new Map<string, PreparationArticleSelection>()
  for (const raw of value.slice(0, 200)) {
    const item = raw as Partial<PreparationArticleSelection>
    const articleCode = cleanText(item.articleCode, 80).toUpperCase()
    const articleName = cleanText(item.articleName, 200)
    const quantity = cleanCount(item.quantity)
    if (!articleCode || !articleName || quantity < 1) continue
    unique.set(articleCode, { articleCode, articleName, quantity })
  }
  return [...unique.values()]
}

export function cleanPreparationMissingArticles(value: unknown): PreparationMissingArticle[] {
  const allowedReasons = new Set(['sense_estoc', 'trencat', 'no_localitzat', 'pendent', 'altre'])
  if (!Array.isArray(value)) return []
  return value.slice(0, 200).flatMap((raw) => {
    const item = raw as Partial<PreparationMissingArticle>
    const articleCode = cleanText(item.articleCode, 80).toUpperCase()
    const articleName = cleanText(item.articleName, 200)
    const quantity = cleanCount(item.quantity)
    if (!articleCode || !articleName || quantity < 1) return []
    const reason = allowedReasons.has(String(item.reason))
      ? (item.reason as PreparationMissingArticle['reason'])
      : 'pendent'
    const loadingResolution =
      item.loadingResolution === 'prepared' || item.loadingResolution === 'left_unprepared'
        ? item.loadingResolution
        : undefined
    const loadingResolvedAt = Number(item.loadingResolvedAt) || undefined
    const loadingResolvedByUserId = cleanText(item.loadingResolvedByUserId, 200) || undefined
    const loadingResolvedByUserName = cleanText(item.loadingResolvedByUserName, 200) || undefined
    return [{
      articleCode,
      articleName,
      quantity,
      reason,
      note: cleanText(item.note, 500),
      prepared: item.prepared === true,
      ...(loadingResolution ? { loadingResolution } : {}),
      ...(loadingResolvedAt ? { loadingResolvedAt } : {}),
      ...(loadingResolvedByUserId ? { loadingResolvedByUserId } : {}),
      ...(loadingResolvedByUserName ? { loadingResolvedByUserName } : {}),
    }]
  })
}

export function emptyPreparationForm(
  eventRowId: string,
  warehouseCode: PreparationWarehouseCode
): PreparationWarehouseForm {
  return {
    eventRowId,
    warehouseCode,
    carts: 0,
    euroPallets: 0,
    americanPallets: 0,
    racks: 0,
    gelPileBags: 0,
    gelStoneBags: 0,
    gelMojitoBags: 0,
    machinery: [],
    smallMachinery: [],
    logisticsPacks: [],
    palletJacks: [],
    missingArticles: [],
    notes: '',
    status: 'draft',
  }
}

function sanitizeForm(
  raw: Partial<PreparationWarehouseForm>,
  eventRowId: string,
  warehouseCode: PreparationWarehouseCode
): PreparationWarehouseForm {
  return {
    ...emptyPreparationForm(eventRowId, warehouseCode),
    carts: cleanCount(raw.carts),
    euroPallets: cleanCount(raw.euroPallets),
    americanPallets: cleanCount(raw.americanPallets),
    racks: cleanCount(raw.racks),
    gelPileBags: cleanCount(raw.gelPileBags),
    gelStoneBags: cleanCount(raw.gelStoneBags),
    gelMojitoBags: cleanCount(raw.gelMojitoBags),
    machinery: cleanSelections(raw.machinery),
    smallMachinery: cleanSelections(raw.smallMachinery),
    logisticsPacks: cleanSelections(
      raw.logisticsPacks ?? (raw as Partial<PreparationWarehouseForm> & { kits?: unknown }).kits
    ),
    palletJacks: cleanSelections(raw.palletJacks),
    missingArticles: cleanPreparationMissingArticles(raw.missingArticles),
    notes: cleanText(raw.notes, 2000),
    status: raw.status === 'completed' ? 'completed' : 'draft',
  }
}

function formDocId(source: SourceCollection, rowId: string, warehouseCode: string) {
  return `${source}--${rowId}--${warehouseCode}`.replaceAll('/', '_')
}

function preparationEventKey(
  sourceCollection: SourceCollection,
  rowId: string,
  sourceData: Record<string, unknown>
) {
  if (sourceCollection !== 'logistics_preparation_services') return rowId
  return cleanText(
    sourceData.ParentEventId ||
      sourceData.ParentEventCode ||
      sourceData.EventCode ||
      rowId,
    200
  )
}

async function findSource(rowId: string) {
  for (const sourceCollection of SOURCE_COLLECTIONS) {
    const ref = db.collection(sourceCollection).doc(rowId)
    const snap = await ref.get()
    if (snap.exists) {
      return { sourceCollection, ref, data: (snap.data() || {}) as Record<string, unknown> }
    }
  }
  throw new Error('No s\'ha trobat l\'esdeveniment de preparació.')
}

async function resolveEventInterval(
  sourceCollection: SourceCollection,
  sourceData: Record<string, unknown>
): Promise<EventInterval> {
  let eventData = sourceData
  if (sourceCollection === 'logistics_preparation_services') {
    const parentEventId = cleanText(sourceData.ParentEventId, 200)
    if (parentEventId) {
      const parentSnap = await db.collection('stage_verd').doc(parentEventId).get()
      if (parentSnap.exists) eventData = (parentSnap.data() || {}) as Record<string, unknown>
    }
  }

  const startDate = normalizeDate(eventData.DataInici ?? eventData.startDate ?? eventData.start)
  const endDate = normalizeDate(
    eventData.DataFi ?? eventData.endDate ?? eventData.end ?? eventData.DataInici
  )
  if (!startDate || !endDate) {
    throw new Error('L’esdeveniment no té una data d’inici i final vàlida.')
  }
  const startTime = normalizeTime(eventData.HoraInici ?? eventData.startTime, '00:00')
  const endTime = normalizeTime(eventData.HoraFi ?? eventData.endTime, '23:59')
  const startKey = `${startDate}T${startTime}`
  let endKey = `${endDate}T${endTime}`
  if (endKey <= startKey) endKey = `${endDate}T23:59`
  if (endKey <= startKey) {
    throw new Error('La finalització de l’esdeveniment ha de ser posterior a l’inici.')
  }
  return { startKey, endKey, startLabel: `${startDate} ${startTime}`, endLabel: `${endDate} ${endTime}` }
}

export async function getPreparationForm(
  rowId: string,
  warehouseCode: PreparationWarehouseCode
) {
  const source = await findSource(rowId)
  const interval = await resolveEventInterval(source.sourceCollection, source.data)
  const id = formDocId(source.sourceCollection, rowId, warehouseCode)
  const snap = await db.collection(FORMS_COLLECTION).doc(id).get()
  const form = snap.exists
    ? sanitizeForm(snap.data() as Partial<PreparationWarehouseForm>, rowId, warehouseCode)
    : emptyPreparationForm(rowId, warehouseCode)
  const stored = snap.data() || {}
  return {
    form: {
      ...form,
      updatedAt: Number(stored.updatedAt) || undefined,
      updatedByUserId: cleanText(stored.updatedByUserId, 200) || undefined,
      updatedByUserName: cleanText(stored.updatedByUserName, 200) || undefined,
    },
    interval,
  }
}

function reservationItems(form: PreparationWarehouseForm) {
  const merged = new Map<string, PreparationArticleSelection>()
  for (const item of [...form.machinery, ...form.smallMachinery, ...form.palletJacks]) {
    const current = merged.get(item.articleCode)
    merged.set(item.articleCode, {
      ...item,
      quantity: (current?.quantity || 0) + item.quantity,
    })
  }
  return [...merged.values()]
}

export async function savePreparationForm(params: {
  rowId: string
  warehouseCode: PreparationWarehouseCode
  rawForm: Partial<PreparationWarehouseForm>
  userId: string
  userName: string
}) {
  const source = await findSource(params.rowId)
  const interval = await resolveEventInterval(source.sourceCollection, source.data)
  const id = formDocId(source.sourceCollection, params.rowId, params.warehouseCode)
  const form = sanitizeForm(params.rawForm, params.rowId, params.warehouseCode)
  const desired = reservationItems(form)
  const now = Date.now()

  await db.runTransaction(async (transaction) => {
    const checks: Array<{
      item: PreparationArticleSelection
      stock: number
      reserved: number
      lockRef: FirebaseFirestore.DocumentReference
    }> = []

    const articleRefs = desired.map((item) =>
      db.collection(ARTICLE_COLLECTION).doc(item.articleCode)
    )
    const lockRefs = desired.map((item) =>
      db.collection('logistics_preparation_reservation_locks').doc(item.articleCode)
    )
    const articleSnaps = articleRefs.length
      ? await transaction.getAll(...articleRefs)
      : []
    if (lockRefs.length) await transaction.getAll(...lockRefs)

    const reservationQueries: FirebaseFirestore.Query[] = []
    for (let offset = 0; offset < desired.length; offset += 30) {
      reservationQueries.push(
        db.collection(RESERVATIONS_COLLECTION).where(
          'articleCode',
          'in',
          desired.slice(offset, offset + 30).map((item) => item.articleCode)
        )
      )
    }
    const [existingReservationSnap, reservationSnaps] = await Promise.all([
      transaction.get(
        db.collection(RESERVATIONS_COLLECTION).where('formId', '==', id)
      ),
      Promise.all(reservationQueries.map((query) => transaction.get(query))),
    ])
    const reservationsByArticle = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>()
    for (const reservation of reservationSnaps.flatMap((snap) => snap.docs)) {
      const articleCode = cleanText(reservation.data().articleCode, 80).toUpperCase()
      const current = reservationsByArticle.get(articleCode) || []
      current.push(reservation)
      reservationsByArticle.set(articleCode, current)
    }

    desired.forEach((item, index) => {
      const articleSnap = articleSnaps[index]
      const lockRef = lockRefs[index]
      if (!articleSnap.exists) throw new Error(`L’article ${item.articleCode} ja no existeix.`)
      const article = articleSnap.data() || {}
      const stock = article.preparationStock === undefined
        ? 1
        : Math.max(0, Math.floor(Number(article.preparationStock) || 0))
      let reserved = 0
      ;(reservationsByArticle.get(item.articleCode) || []).forEach((reservation) => {
        const data = reservation.data()
        if (data.formId === id || data.status !== 'active') return
        if (preparationIntervalsOverlap(
          { startKey: String(data.startKey), endKey: String(data.endKey) },
          interval
        )) {
          reserved += cleanCount(data.quantity)
        }
      })
      const available = preparationAvailableQuantity(stock, reserved)
      if (item.quantity > available) {
        throw new Error(
          `${item.articleName}: només hi ha ${available} unitats disponibles en aquest horari.`
        )
      }
      checks.push({ item, stock, reserved, lockRef })
    })

    existingReservationSnap.docs.forEach((reservation) => transaction.delete(reservation.ref))
    checks.forEach(({ item, lockRef }) => {
      const reservationRef = db
        .collection(RESERVATIONS_COLLECTION)
        .doc(`${id}--${item.articleCode}`.replaceAll('/', '_'))
      transaction.set(reservationRef, {
        formId: id,
        eventRowId: params.rowId,
        warehouseCode: params.warehouseCode,
        articleCode: item.articleCode,
        articleName: item.articleName,
        quantity: item.quantity,
        startKey: interval.startKey,
        endKey: interval.endKey,
        status: 'active',
        updatedAt: now,
        updatedByUserId: params.userId,
        updatedByUserName: params.userName,
      })
      transaction.set(lockRef, { updatedAt: now }, { merge: true })
    })

    transaction.set(
      db.collection(FORMS_COLLECTION).doc(id),
      {
        ...form,
        sourceCollection: source.sourceCollection,
        eventKey: preparationEventKey(source.sourceCollection, params.rowId, source.data),
        interval,
        updatedAt: now,
        updatedByUserId: params.userId,
        updatedByUserName: params.userName,
      },
      { merge: false }
    )
    if (form.status === 'completed') {
      transaction.update(source.ref, {
        [`PreparacioMagatzems.${params.warehouseCode}`]: {
          userId: params.userId,
          userName: params.userName,
          at: new Date(now).toISOString(),
        },
        updatedAt: new Date(now).toISOString(),
      })
    }
  })

  return { form: { ...form, updatedAt: now, updatedByUserId: params.userId, updatedByUserName: params.userName }, interval }
}

export async function resolvePreparationMissingArticlesForLoading(params: {
  refs: Array<{
    eventRowId: string
    warehouseCode: PreparationWarehouseCode
    articleCode: string
  }>
  resolution: 'prepared' | 'left_unprepared'
  userId: string
  userName: string
}) {
  const uniqueRefs = new Map<string, (typeof params.refs)[number]>()
  for (const item of params.refs.slice(0, 100)) {
    const eventRowId = cleanText(item.eventRowId, 200)
    const articleCode = cleanText(item.articleCode, 80).toUpperCase()
    if (!eventRowId || !articleCode) continue
    uniqueRefs.set(`${eventRowId}--${item.warehouseCode}--${articleCode}`, {
      eventRowId,
      warehouseCode: item.warehouseCode,
      articleCode,
    })
  }
  if (!uniqueRefs.size) throw new Error('No hi ha articles pendents per actualitzar.')
  const now = Date.now()
  let updatedCount = 0

  for (const item of uniqueRefs.values()) {
    const source = await findSource(item.eventRowId)
    const id = formDocId(source.sourceCollection, item.eventRowId, item.warehouseCode)
    const ref = db.collection(FORMS_COLLECTION).doc(id)
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists) throw new Error('No s\'ha trobat la fitxa de preparació.')
      const data = snap.data() as Partial<PreparationWarehouseForm> & Record<string, unknown>
      const missingArticles = cleanPreparationMissingArticles(data.missingArticles)
      let found = false
      const nextArticles = missingArticles.map((article) => {
        if (article.articleCode !== item.articleCode) return article
        found = true
        return {
          ...article,
          prepared: params.resolution === 'prepared',
          loadingResolution: params.resolution,
          loadingResolvedAt: now,
          loadingResolvedByUserId: params.userId,
          loadingResolvedByUserName: params.userName,
        }
      })
      if (!found) throw new Error(`L’article ${item.articleCode} ja no consta com a pendent.`)
      transaction.update(ref, {
        missingArticles: nextArticles,
        updatedAt: now,
        updatedByUserId: params.userId,
        updatedByUserName: params.userName,
      })
    })
    updatedCount += 1
  }

  return { updatedCount, resolvedAt: now }
}

export type PreparationCatalogPurpose =
  | 'machinery'
  | 'small_machinery'
  | 'logistics_pack'
  | 'pallet_jack'
  | 'assigned'

function matchesWarehousePurpose(
  name: string,
  purpose: PreparationCatalogPurpose,
  assignedWarehouseCode?: string
) {
  const normalized = normalizeSearch(name)
  if (purpose === 'machinery' || purpose === 'small_machinery' || purpose === 'pallet_jack') {
    return normalized.includes('maquinaria')
  }
  if (purpose === 'logistics_pack') return normalized.includes('mobiliari')
  const assigned = normalizeSearch(assignedWarehouseCode)
  if (assigned === 'bodega') {
    const warehouseCode = normalizeSearch(name).split(/\s+/)[0]
    return warehouseCode === '04' || normalized.includes('begud') || normalized.includes('bodega')
  }
  return normalized.includes(assigned)
}

export async function findPreparationCatalogWarehouse(
  purpose: PreparationCatalogPurpose,
  assignedWarehouseCode?: string
) {
  const warehouses = await listEventComandaWarehouses(true)
  return warehouses.find((warehouse) =>
    matchesWarehousePurpose(`${warehouse.code} ${warehouse.name}`, purpose, assignedWarehouseCode)
  ) || null
}

async function reservedPreparationQuantities(
  codes: string[],
  params: {
    interval: EventInterval
    excludeEventRowId?: string
    excludeWarehouseCode?: string
  }
) {
  const reservedByCode = new Map<string, number>()
  for (let offset = 0; offset < codes.length; offset += 30) {
    const chunk = codes.slice(offset, offset + 30)
    if (!chunk.length) continue
    const reservations = await db
      .collection(RESERVATIONS_COLLECTION)
      .where('articleCode', 'in', chunk)
      .get()
    reservations.docs.forEach((reservation) => {
      const data = reservation.data()
      if (data.status !== 'active') return
      if (
        data.eventRowId === params.excludeEventRowId &&
        data.warehouseCode === params.excludeWarehouseCode
      ) return
      if (preparationIntervalsOverlap(
        { startKey: String(data.startKey), endKey: String(data.endKey) },
        params.interval
      )) {
        const code = cleanText(data.articleCode, 80).toUpperCase()
        reservedByCode.set(code, (reservedByCode.get(code) || 0) + cleanCount(data.quantity))
      }
    })
  }
  return reservedByCode
}

export async function listPreparationCatalog(params: {
  purpose: PreparationCatalogPurpose
  assignedWarehouseCode?: string
  q?: string
  interval: EventInterval
  excludeEventRowId?: string
  excludeWarehouseCode?: string
}) {
  const warehouse = await findPreparationCatalogWarehouse(
    params.purpose,
    params.assignedWarehouseCode
  )
  if (!warehouse) return { warehouse: null, articles: [] as PreparationCatalogArticle[] }
  const query = normalizeSearch(params.q)

  if (params.purpose === 'assigned') {
    if (query.length < 2) return { warehouse, articles: [] as PreparationCatalogArticle[] }
    const snap = await db.collection(ARTICLE_COLLECTION).where('warehouseId', '==', warehouse.id).get()
    const candidates = snap.docs
      .filter((doc) => doc.data().isActive !== false)
      .map((doc) => {
        const data = doc.data()
        return {
          articleCode: cleanText(data.code || doc.id, 80).toUpperCase(),
          articleName: cleanText(data.name, 200) || cleanText(data.code || doc.id, 80).toUpperCase(),
          preparationStock: data.preparationStock,
        }
      })
      .filter((article) => preparationArticleMatchesSearch(article, query))
      .sort((left, right) => {
        const leftCode = normalizeSearch(left.articleCode)
        const rightCode = normalizeSearch(right.articleCode)
        const leftName = normalizeSearch(left.articleName)
        const rightName = normalizeSearch(right.articleName)
        const leftRank = leftCode.startsWith(query) ? 0 : leftName.startsWith(query) ? 1 : 2
        const rightRank = rightCode.startsWith(query) ? 0 : rightName.startsWith(query) ? 1 : 2
        return leftRank - rightRank || leftName.localeCompare(rightName, 'ca')
      })
      .slice(0, 100)
    const codes = candidates.map((article) => article.articleCode)
    const reservedByCode = await reservedPreparationQuantities(codes, params)
    return {
      warehouse,
      articles: candidates.map((article) => {
        const totalStock = article.preparationStock === undefined
          ? 1
          : Math.max(0, Math.floor(Number(article.preparationStock) || 0))
        const reservedStock = reservedByCode.get(article.articleCode) || 0
        return {
          articleCode: article.articleCode,
          articleName: article.articleName || article.articleCode,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          totalStock,
          reservedStock,
          availableStock: preparationAvailableQuantity(totalStock, reservedStock),
        }
      }),
    }
  }

  const snap = await db.collection(ARTICLE_COLLECTION).where('warehouseId', '==', warehouse.id).get()
  const docs = snap.docs
    .filter((doc) => doc.data().isActive !== false)
    .filter((doc) => params.purpose !== 'machinery' || doc.data().preparationReservable !== false)
    .filter((doc) => {
      const catalogType = cleanText(doc.data().preparationCatalogType, 50)
      if (params.purpose === 'machinery') return !catalogType || catalogType === 'machinery'
      return catalogType === params.purpose
    })
    .filter((doc) => {
      if (!query) return true
      const data = doc.data()
      return preparationArticleMatchesSearch(
        { articleCode: data.code || doc.id, articleName: data.name || '' },
        query
      )
    })
    .sort((a, b) => String(a.data().name || '').localeCompare(String(b.data().name || ''), 'ca'))
    .slice(0, 100)

  const codes = docs.map((doc) => cleanText(doc.data().code || doc.id, 80).toUpperCase())
  const reservedByCode = await reservedPreparationQuantities(codes, params)

  const articles = docs.map((doc) => {
    const data = doc.data()
    const articleCode = cleanText(data.code || doc.id, 80).toUpperCase()
    const totalStock = data.preparationStock === undefined
      ? 1
      : Math.max(0, Math.floor(Number(data.preparationStock) || 0))
    const reservedStock = reservedByCode.get(articleCode) || 0
    return {
      articleCode,
      articleName: cleanText(data.name, 200) || articleCode,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      totalStock,
      reservedStock,
      availableStock: preparationAvailableQuantity(totalStock, reservedStock),
    }
  })
  return { warehouse, articles }
}

export async function createPreparationCatalogArticle(params: {
  purpose: 'machinery' | 'small_machinery' | 'logistics_pack' | 'pallet_jack'
  name: string
  stock: number
  userId: string
}) {
  const warehouse = await findPreparationCatalogWarehouse(params.purpose)
  if (!warehouse) throw new Error('No s’ha trobat el magatzem corresponent a Settings → Magatzems.')
  const name = cleanText(params.name, 200)
  if (name.length < 2) throw new Error('Cal indicar el nom de l’article.')
  const stock = Math.max(1, cleanCount(params.stock))
  const prefix =
    params.purpose === 'machinery'
      ? 'MAQ'
      : params.purpose === 'small_machinery'
      ? 'MAP'
      : params.purpose === 'logistics_pack'
        ? 'PKL'
        : 'TRP'
  const normalizedName = normalizeSearch(name)
  const duplicateSnap = await db
    .collection(ARTICLE_COLLECTION)
    .where('nameSearch', '==', normalizedName)
    .get()
  const duplicate = duplicateSnap.docs.find((doc) => {
    const data = doc.data()
    const sameType = params.purpose === 'machinery'
      ? !data.preparationCatalogType || data.preparationCatalogType === 'machinery'
      : data.preparationCatalogType === params.purpose
    return data.warehouseId === warehouse.id && sameType &&
      normalizeSearch(data.name) === normalizedName
  })
  if (duplicate) {
    throw new Error(`Ja existeix un article amb aquest nom (${duplicate.id}).`)
  }
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase()
  const articleCode = `${prefix}-${suffix}`
  const now = Date.now()
  await db.collection(ARTICLE_COLLECTION).doc(articleCode).set({
      code: articleCode,
      name,
      nameSearch: normalizeSearch(name),
      family: params.purpose === 'logistics_pack' ? 'Packs de logística' : 'Maquinària',
      unit: 'UN',
      warehouseId: warehouse.id,
      warehouseSource: 'manual',
      preparationCatalogType: params.purpose,
      preparationReservable: params.purpose !== 'logistics_pack',
      preparationStock: stock,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdByUserId: params.userId,
      updatedByUserId: params.userId,
      usageCount: 0,
    })
  return { articleCode, articleName: name, warehouseId: warehouse.id, warehouseName: warehouse.name, totalStock: stock, reservedStock: 0, availableStock: stock }
}

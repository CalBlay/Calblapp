import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import type {
  PreparationArticleSelection,
  PreparationMissingArticle,
  PreparationWarehouseForm,
} from '@/lib/logistics/prepTypes'

const FORMS_COLLECTION = 'logistics_preparation_forms'
const LOADING_COLLECTION = 'logistics_loading_checklists'

type StoredPreparationForm = PreparationWarehouseForm & {
  sourceCollection?: 'stage_verd' | 'logistics_preparation_services'
  eventKey?: string
  interval?: { startKey?: string; endKey?: string; startLabel?: string; endLabel?: string }
}

export type LoadingStateEntry = {
  loaded: boolean
  quantity: number
  at: number
  userId: string
  userName: string
}

export type LogisticsLoadingLine = {
  key: string
  label: string
  quantity: number
  kind: 'load' | 'pending'
  warehouseCodes: string[]
  ready: boolean
  loaded: boolean
  loadedAt?: number
  loadedByName?: string
  pendingRefs?: Array<{
    eventRowId: string
    warehouseCode: string
    articleCode: string
  }>
  pendingResolution?: 'left_unprepared'
  pendingResolvedByName?: string
}

export type LogisticsLoadingEvent = {
  eventKey: string
  eventCode: string
  eventName: string
  location: string
  startKey: string
  endKey: string
  lines: LogisticsLoadingLine[]
  loadedCount: number
  loadableCount: number
  pendingPreparationCount: number
}

export type LogisticsPreparationDashboardWarehouse = {
  warehouseCode: string
  preparationCompleted: boolean
  pendingArticles: Array<{
    articleCode: string
    articleName: string
    quantity: number
    reason?: string
    loadingResolution?: 'prepared' | 'left_unprepared'
    loadingResolvedByUserName?: string
  }>
  loadingLines: LogisticsLoadingLine[]
}

export type LogisticsPreparationDashboardDetail = {
  eventRowId: string
  eventKey: string
  warehouses: LogisticsPreparationDashboardWarehouse[]
  loadedCount: number
  loadableCount: number
  pendingPreparationCount: number
}

type LoadingLineDraft = Omit<LogisticsLoadingLine, 'loaded' | 'loadedAt' | 'loadedByName'> & {
  /** Clau anterior a la separació visual per magatzems, usada només per conservar checks existents. */
  legacyKey?: string
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function count(value: unknown) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

function safeDocId(value: string) {
  return value.replaceAll('/', '_').slice(0, 1000)
}

function addLine(
  lines: Map<string, LoadingLineDraft>,
  input: LoadingLineDraft
) {
  if (input.quantity < 1) return
  const current = lines.get(input.key)
  if (!current) {
    lines.set(input.key, input)
    return
  }
  lines.set(input.key, {
    ...current,
    quantity: current.quantity + input.quantity,
    ready: current.ready && input.ready,
    warehouseCodes: [...new Set([...current.warehouseCodes, ...input.warehouseCodes])],
    pendingRefs: [...(current.pendingRefs || []), ...(input.pendingRefs || [])],
    pendingResolution:
      current.pendingResolution === input.pendingResolution
        ? current.pendingResolution
        : undefined,
    pendingResolvedByName:
      current.pendingResolvedByName === input.pendingResolvedByName
        ? current.pendingResolvedByName
        : undefined,
  })
}

function addSelections(
  lines: Map<string, LoadingLineDraft>,
  selections: PreparationArticleSelection[] | undefined,
  params: { prefix: string; label: string; warehouseCode: string }
) {
  for (const item of selections || []) {
    const articleCode = text(item.articleCode).toUpperCase()
    if (!articleCode) continue
    const legacyKey = `${params.prefix}:${articleCode}`
    addLine(lines, {
      key: params.warehouseCode ? `${params.warehouseCode}:${legacyKey}` : legacyKey,
      legacyKey,
      label: `${params.label} · ${text(item.articleName) || articleCode}`,
      quantity: count(item.quantity),
      kind: 'load',
      warehouseCodes: [params.warehouseCode],
      ready: true,
    })
  }
}

function addMissingArticles(
  lines: Map<string, LoadingLineDraft>,
  items: PreparationMissingArticle[] | undefined,
  warehouseCode: string,
  eventRowId: string
) {
  for (const item of items || []) {
    const articleCode = text(item.articleCode).toUpperCase()
    if (!articleCode) continue
    const ready = item.prepared === true
    const leftUnprepared = !ready && item.loadingResolution === 'left_unprepared'
    addLine(lines, {
      key: `missing:${warehouseCode}:${articleCode}`,
      label: ready
        ? `Article recuperat · ${text(item.articleName) || articleCode}`
        : leftUnprepared
          ? `Sense preparar · ${text(item.articleName) || articleCode}`
          : `Pendent de preparar · ${text(item.articleName) || articleCode}`,
      quantity: count(item.quantity),
      kind: ready ? 'load' : 'pending',
      warehouseCodes: [warehouseCode],
      ready,
      pendingRefs: [{ eventRowId, warehouseCode, articleCode }],
      pendingResolution: leftUnprepared ? 'left_unprepared' : undefined,
      pendingResolvedByName: leftUnprepared
        ? text(item.loadingResolvedByUserName) || undefined
        : undefined,
    })
  }
}

function addFormLines(
  lines: Map<string, LoadingLineDraft>,
  form: StoredPreparationForm
) {
  const warehouseCode = text(form.warehouseCode).toUpperCase()
  const counters: Array<[string, string, number]> = [
    ['carts', 'Carros', count(form.carts)],
    ['euro-pallets', 'Palets EU', count(form.euroPallets)],
    ['american-pallets', 'Palets AM', count(form.americanPallets)],
    ['racks', 'Racks', count(form.racks)],
    ['gel-pile', 'Sacs de gel pilé', count(form.gelPileBags)],
    ['gel-stone', 'Sacs de gel pedra', count(form.gelStoneBags)],
    ['gel-mojito', 'Sacs de gel mojito', count(form.gelMojitoBags)],
  ]
  for (const [key, label, quantity] of counters) {
    addLine(lines, {
      key: warehouseCode ? `${warehouseCode}:${key}` : key,
      legacyKey: key,
      label,
      quantity,
      kind: 'load',
      warehouseCodes: warehouseCode ? [warehouseCode] : [],
      ready: true,
    })
  }
  addSelections(lines, form.machinery, { prefix: 'machinery', label: 'Maquinària', warehouseCode })
  addSelections(lines, form.smallMachinery, { prefix: 'small-machinery', label: 'Maquinària petita', warehouseCode })
  addSelections(lines, form.logisticsPacks, { prefix: 'logistics-pack', label: 'Pack de logística', warehouseCode })
  addSelections(lines, form.palletJacks, { prefix: 'pallet-jack', label: 'Transpalet', warehouseCode })
  addMissingArticles(lines, form.missingArticles, warehouseCode, form.eventRowId)
}

function resolveLoadingLines(
  drafts: Iterable<LoadingLineDraft>,
  stored: Record<string, LoadingStateEntry>
) {
  const allDrafts = [...drafts]
  const legacyKeyCounts = new Map<string, number>()
  for (const line of allDrafts) {
    if (line.legacyKey) {
      legacyKeyCounts.set(line.legacyKey, (legacyKeyCounts.get(line.legacyKey) || 0) + 1)
    }
  }
  return allDrafts.map((draft): LogisticsLoadingLine => {
    const { legacyKey, ...line } = draft
    const legacyState = legacyKey && legacyKeyCounts.get(legacyKey) === 1
      ? stored[legacyKey]
      : undefined
    const state = stored[line.key] || legacyState
    const loaded = line.ready && state?.loaded === true && count(state.quantity) === line.quantity
    return {
      ...line,
      loaded,
      loadedAt: loaded ? Number(state.at) || undefined : undefined,
      loadedByName: loaded ? text(state.userName) || undefined : undefined,
    }
  })
}

export function buildDashboardLoadingLinesByEventKey(
  records: Array<{ eventKey: string; form: PreparationWarehouseForm }>,
  checklistByEventKey: Map<string, Record<string, LoadingStateEntry>>
) {
  const draftsByEventKey = new Map<string, Map<string, LoadingLineDraft>>()
  for (const { form, eventKey } of records) {
    const drafts = draftsByEventKey.get(eventKey) || new Map<string, LoadingLineDraft>()
    addFormLines(drafts, form)
    draftsByEventKey.set(eventKey, drafts)
  }
  return new Map(
    [...draftsByEventKey.entries()].map(([eventKey, drafts]) => [
      eventKey,
      resolveLoadingLines(
        drafts.values(),
        checklistByEventKey.get(eventKey) || {}
      ).sort((a, b) => Number(a.ready) - Number(b.ready) || a.label.localeCompare(b.label, 'ca')),
    ])
  )
}

function sourceEventIdentity(
  form: StoredPreparationForm,
  source: Record<string, unknown>
) {
  const isService = form.sourceCollection === 'logistics_preparation_services'
  const eventKey = isService
    ? text(source.ParentEventId || source.ParentEventCode || source.EventCode || form.eventRowId)
    : form.eventRowId
  return {
    eventKey,
    eventCode: text(
      source.ParentEventCode ||
      source.EventCode ||
      source.code ||
      source.Code ||
      source.C_digo ||
      source.codi ||
      source.Codi
    ),
    eventName: text(source.ParentEventName || source.NomEvent || source.eventName) || 'Esdeveniment',
    location: text(source.Ubicacio || source.finca),
  }
}

export async function listLogisticsLoadingEvents(start: string, end: string) {
  const formSnap = await db
    .collection(FORMS_COLLECTION)
    .where('interval.startKey', '>=', `${start}T00:00`)
    .where('interval.startKey', '<=', `${end}T23:59:59`)
    .get()
  const forms = formSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as StoredPreparationForm),
  }))

  if (!forms.length) return [] as LogisticsLoadingEvent[]

  const sourceRefs = forms.map((form) =>
    db.collection(form.sourceCollection || 'stage_verd').doc(form.eventRowId)
  )
  const sourceSnaps = await db.getAll(...sourceRefs)
  const groups = new Map<
    string,
    {
      eventCode: string
      eventName: string
      location: string
      startKey: string
      endKey: string
      lines: Map<string, LoadingLineDraft>
    }
  >()

  forms.forEach((form, index) => {
    const source = (sourceSnaps[index]?.data() || {}) as Record<string, unknown>
    const identity = sourceEventIdentity(form, source)
    if (!identity.eventKey) return
    const startKey = text(form.interval?.startKey)
    const endKey = text(form.interval?.endKey)
    const current = groups.get(identity.eventKey) || {
      eventCode: identity.eventCode,
      eventName: identity.eventName,
      location: identity.location,
      startKey,
      endKey,
      lines: new Map(),
    }
    if (!current.eventCode) current.eventCode = identity.eventCode
    if (current.eventName === 'Esdeveniment') current.eventName = identity.eventName
    if (!current.location) current.location = identity.location
    if (startKey && (!current.startKey || startKey < current.startKey)) current.startKey = startKey
    if (endKey && endKey > current.endKey) current.endKey = endKey
    addFormLines(current.lines, form)
    groups.set(identity.eventKey, current)
  })

  const eventKeys = [...groups.keys()]
  const checklistSnaps = await db.getAll(
    ...eventKeys.map((eventKey) => db.collection(LOADING_COLLECTION).doc(safeDocId(eventKey)))
  )

  return eventKeys
    .map((eventKey, index) => {
      const group = groups.get(eventKey)!
      const stored = (checklistSnaps[index]?.data()?.lines || {}) as Record<string, LoadingStateEntry>
      const lines = resolveLoadingLines(group.lines.values(), stored)
      lines.sort((a, b) => Number(a.ready) - Number(b.ready) || a.label.localeCompare(b.label, 'ca'))
      const loadable = lines.filter((line) => line.ready)
      return {
        eventKey,
        eventCode: group.eventCode,
        eventName: group.eventName,
        location: group.location,
        startKey: group.startKey,
        endKey: group.endKey,
        lines,
        loadedCount: loadable.filter((line) => line.loaded).length,
        loadableCount: loadable.length,
        pendingPreparationCount: lines.filter((line) => !line.ready).length,
      }
    })
    .sort((a, b) => a.startKey.localeCompare(b.startKey) || a.eventName.localeCompare(b.eventName, 'ca'))
}

export async function listLogisticsPreparationDashboardDetails(rowIds: string[]) {
  const wantedIds = [...new Set(rowIds.map(text).filter(Boolean))].slice(0, 250)
  if (!wantedIds.length) return [] as LogisticsPreparationDashboardDetail[]

  const formDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()
  for (let offset = 0; offset < wantedIds.length; offset += 30) {
    const chunk = wantedIds.slice(offset, offset + 30)
    const snap = await db.collection(FORMS_COLLECTION).where('eventRowId', 'in', chunk).get()
    snap.docs.forEach((doc) => formDocs.set(doc.id, doc))
  }
  const forms = [...formDocs.values()].map((doc) => doc.data() as StoredPreparationForm)
  if (!forms.length) {
    return wantedIds.map((eventRowId) => ({
      eventRowId,
      eventKey: eventRowId,
      warehouses: [],
      loadedCount: 0,
      loadableCount: 0,
      pendingPreparationCount: 0,
    }))
  }

  const sourceSnaps = await db.getAll(
    ...forms.map((form) =>
      db.collection(form.sourceCollection || 'stage_verd').doc(form.eventRowId)
    )
  )
  const records = forms.map((form, index) => {
    const source = (sourceSnaps[index]?.data() || {}) as Record<string, unknown>
    return { form, eventKey: sourceEventIdentity(form, source).eventKey || form.eventRowId }
  })
  const eventKeys = [...new Set(records.map((record) => record.eventKey).filter(Boolean))]
  for (let offset = 0; offset < eventKeys.length; offset += 30) {
    const chunk = eventKeys.slice(offset, offset + 30)
    const relatedSnap = await db.collection(FORMS_COLLECTION).where('eventKey', 'in', chunk).get()
    for (const doc of relatedSnap.docs) {
      if (formDocs.has(doc.id)) continue
      formDocs.set(doc.id, doc)
      const form = doc.data() as StoredPreparationForm
      records.push({ form, eventKey: text(form.eventKey) || form.eventRowId })
    }
  }
  const checklistSnaps = eventKeys.length
    ? await db.getAll(
        ...eventKeys.map((eventKey) => db.collection(LOADING_COLLECTION).doc(safeDocId(eventKey)))
      )
    : []
  const checklistByEventKey = new Map(
    eventKeys.map((eventKey, index) => [
      eventKey,
      (checklistSnaps[index]?.data()?.lines || {}) as Record<string, LoadingStateEntry>,
    ])
  )
  const loadingLinesByEventKey = buildDashboardLoadingLinesByEventKey(
    records,
    checklistByEventKey
  )

  const details = new Map<string, LogisticsPreparationDashboardDetail>()
  for (const eventRowId of wantedIds) {
    details.set(eventRowId, {
      eventRowId,
      eventKey: eventRowId,
      warehouses: [],
      loadedCount: 0,
      loadableCount: 0,
      pendingPreparationCount: 0,
    })
  }

  for (const { form, eventKey } of records) {
    const warehouseCode = text(form.warehouseCode).toUpperCase()
    if (!warehouseCode) continue
    const pendingArticles = (form.missingArticles || [])
      .filter((item) => item.prepared !== true)
      .map((item) => ({
        articleCode: text(item.articleCode),
        articleName: text(item.articleName) || text(item.articleCode),
        quantity: count(item.quantity),
        reason: item.reason ? text(item.reason) : undefined,
        loadingResolution: item.loadingResolution,
        loadingResolvedByUserName: text(item.loadingResolvedByUserName) || undefined,
      }))
    const detail = details.get(form.eventRowId)
    if (!detail) continue
    detail.eventKey = eventKey
    detail.warehouses.push({
      warehouseCode,
      preparationCompleted: form.status === 'completed',
      pendingArticles,
      loadingLines: [],
    })
  }

  for (const detail of details.values()) {
    const parentLines = loadingLinesByEventKey.get(detail.eventKey) || []
    for (const line of parentLines) {
      const warehouseCode = line.warehouseCodes[0] || 'LOGISTICA'
      let warehouse = detail.warehouses.find((item) => item.warehouseCode === warehouseCode)
      if (!warehouse) {
        warehouse = {
          warehouseCode,
          preparationCompleted: false,
          pendingArticles: [],
          loadingLines: [],
        }
        detail.warehouses.push(warehouse)
      }
      warehouse.loadingLines.push(line)
    }
    const lines = detail.warehouses.flatMap((warehouse) => warehouse.loadingLines)
    const loadable = lines.filter((line) => line.ready)
    detail.loadedCount = loadable.filter((line) => line.loaded).length
    detail.loadableCount = loadable.length
    detail.pendingPreparationCount = detail.warehouses.reduce(
      (total, warehouse) => total + warehouse.pendingArticles.length,
      0
    )
  }
  return [...details.values()]
}

export async function setLogisticsLoadingLine(params: {
  eventKey: string
  lineKey: string
  loaded: boolean
  quantity: number
  userId: string
  userName: string
}) {
  const eventKey = text(params.eventKey)
  const lineKey = text(params.lineKey)
  if (!eventKey || !lineKey || lineKey.includes('.')) throw new Error('Línia de càrrega no vàlida.')
  const ref = db.collection(LOADING_COLLECTION).doc(safeDocId(eventKey))
  const now = Date.now()
  await ref.set(
    {
      eventKey,
      lines: {
        [lineKey]: {
          loaded: params.loaded,
          quantity: count(params.quantity),
          at: now,
          userId: params.userId,
          userName: params.userName,
        },
      },
      updatedAt: now,
      updatedByUserId: params.userId,
      updatedByUserName: params.userName,
    },
    { merge: true }
  )
  return { loaded: params.loaded, at: now, userName: params.userName }
}

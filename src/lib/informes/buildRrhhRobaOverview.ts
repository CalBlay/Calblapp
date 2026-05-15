import type { Firestore } from 'firebase-admin/firestore'
import { DOTACIO_COLLECTIONS } from '@/lib/dotacio/collections'
import type { RrhhReportContext, RrhhRobaOverview, RrhhTopDepartment, RrhhTopProduct } from '@/lib/informes/rrhhOverview'
import {
  deliveredUnitsByRequestId,
  deliverySnapshotFromFirestore,
  firestoreDateToMs,
  mergeQtyMaps,
  requestedLinesFromRequestDoc,
  sumDeliveredForRequestIds,
  sumLineQuantities,
  topNFromMap,
  type DeliverySnapshot,
} from '@/lib/informes/rrhhRobaAggregations'

const REQ = DOTACIO_COLLECTIONS.requests
const DEL = DOTACIO_COLLECTIONS.deliveries
const PROD = DOTACIO_COLLECTIONS.products

const DEFAULT_FETCH_LIMIT = 1_200
const IN_QUERY_CHUNK = 10
const DEFAULT_TOP_N = 10
const DEPT_ARTICLE_TOP = 12

function utcDayKey(ms: number): string {
  const x = new Date(ms)
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
}

function windowUtcRange(window: BuildRrhhOverviewWindow): { startMs: number; endMs: number } {
  if (window.mode === 'rolling') {
    const endMs = Date.now()
    return { startMs: endMs - window.days * 86_400_000, endMs }
  }
  return { startMs: window.fromMs, endMs: window.toMs }
}

function eachUtcCalendarDayBetween(startMs: number, endMs: number): string[] {
  const out: string[] = []
  const s = new Date(startMs)
  let t = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate())
  const e = new Date(endMs)
  const endDay = Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
  while (t <= endDay) {
    out.push(utcDayKey(t))
    t += 86_400_000
  }
  return out
}

export type BuildRrhhOverviewWindow =
  | { mode: 'rolling'; days: number }
  | { mode: 'range'; fromMs: number; toMs: number; dateFrom: string; dateTo: string }

export type BuildRrhhOverviewFilters = {
  department?: string
  status?: string
  statusLabel?: string
  productId?: string
  productLabel?: string
}

export type BuildRrhhOverviewOptions = {
  db: Firestore
  window: BuildRrhhOverviewWindow
  filters?: BuildRrhhOverviewFilters
  fetchLimit?: number
  topN?: number
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size))
  }
  return out
}

async function fetchDeliverySnapshotsForRequestIds(
  db: Firestore,
  requestIds: string[]
): Promise<DeliverySnapshot[]> {
  const uniq = [...new Set(requestIds.map((id) => id.trim()).filter(Boolean))]
  const out: DeliverySnapshot[] = []
  const seenDel = new Set<string>()

  const chunks = chunkIds(uniq, IN_QUERY_CHUNK)
  await Promise.all(
    chunks.map(async (ids) => {
      if (ids.length === 0) return
      const snap = await db.collection(DEL).where('requestId', 'in', ids).get()
      for (const d of snap.docs) {
        if (seenDel.has(d.id)) continue
        seenDel.add(d.id)
        out.push(deliverySnapshotFromFirestore(d.id, d.data() as Record<string, unknown>))
      }
    })
  )
  return out
}

async function productLabelsById(db: Firestore, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids)].filter(Boolean)
  if (uniq.length === 0) return out

  const chunkSize = 20
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const slice = uniq.slice(i, i + chunkSize)
    const refs = slice.map((id) => db.collection(PROD).doc(id))
    const snaps = await db.getAll(...refs)
    for (const s of snaps) {
      if (!s.exists) continue
      const p = s.data() as { code?: string; name?: string; size?: string }
      const code = String(p.code || '').trim()
      const name = String(p.name || '').trim()
      const size = String(p.size || '').trim()
      const label =
        code && name
          ? size
            ? `${code} ${name} · ${size}`
            : `${code} ${name}`
          : name || code || s.id
      out.set(s.id, label)
    }
  }
  return out
}

function inTimeWindow(ms: number | null, window: BuildRrhhOverviewWindow): boolean {
  if (ms == null) return false
  if (window.mode === 'rolling') {
    const cutoff = Date.now() - window.days * 86_400_000
    return ms >= cutoff
  }
  return ms >= window.fromMs && ms <= window.toMs
}

function buildReportContext(
  window: BuildRrhhOverviewWindow,
  filters: BuildRrhhOverviewFilters | undefined
): RrhhReportContext {
  const f = filters ?? {}
  const department = f.department?.trim() || null
  const status = f.status?.trim() || null
  const productId = f.productId?.trim() || null
  const base = {
    department: department || null,
    status,
    statusLabel: f.statusLabel?.trim() || null,
    productId,
    productLabel: f.productLabel?.trim() || null,
  }
  if (window.mode === 'rolling') {
    return { kind: 'rolling', rollingDays: window.days, ...base }
  }
  return {
    kind: 'range',
    dateFrom: window.dateFrom,
    dateTo: window.dateTo,
    ...base,
  }
}

/**
 * Calcula l’overview RRHH roba (mateixa lògica que l’API) amb finestra temporal i filtres opcionals.
 */
export async function buildRrhhRobaOverview(opts: BuildRrhhOverviewOptions): Promise<RrhhRobaOverview> {
  const { db, window, filters } = opts
  const FETCH_LIMIT = opts.fetchLimit ?? DEFAULT_FETCH_LIMIT
  const TOP_N = opts.topN ?? DEFAULT_TOP_N

  const fDept = filters?.department?.trim() || ''
  const fStatus = filters?.status?.trim() || ''
  const fProduct = filters?.productId?.trim() || ''

  const reqSnap = await db.collection(REQ).orderBy('createdAt', 'desc').limit(FETCH_LIMIT).get()

  const byStatus: Record<string, number> = {}
  let totalRequests = 0
  let requestedUnitsInPeriod = 0
  const requestIdsInPeriod: string[] = []
  const qtyByProduct = new Map<string, number>()
  const deptStats = new Map<string, { requestCount: number; requestedUnits: number }>()
  const requestMetaById = new Map<string, { createdMs: number; status: string }>()
  type DailyBucket = { requestCount: number; requestedUnits: number; productIds: Set<string> }
  const dailyBuckets = new Map<string, DailyBucket>()
  const deptProductUnits = new Map<string, { department: string; productId: string; units: number }>()

  for (const d of reqSnap.docs) {
    const data = d.data() as Record<string, unknown>
    const ms = firestoreDateToMs(data.createdAt)
    if (!inTimeWindow(ms, window)) continue

    const st = String(data.status || 'submitted').trim() || 'submitted'
    if (fStatus && st !== fStatus) continue

    const dept = String(data.requestingDepartment || '').trim() || '—'
    if (fDept && dept !== fDept) continue

    const lines = requestedLinesFromRequestDoc(data)
    if (fProduct && !lines.some((l) => l.productId === fProduct)) continue

    totalRequests += 1
    requestIdsInPeriod.push(d.id)

    requestMetaById.set(d.id, { createdMs: ms!, status: st })
    byStatus[st] = (byStatus[st] ?? 0) + 1

    const u = sumLineQuantities(lines)
    requestedUnitsInPeriod += u
    mergeQtyMaps(qtyByProduct, lines)

    const day = utcDayKey(ms!)
    let bucket = dailyBuckets.get(day)
    if (!bucket) {
      bucket = { requestCount: 0, requestedUnits: 0, productIds: new Set() }
      dailyBuckets.set(day, bucket)
    }
    bucket.requestCount += 1
    bucket.requestedUnits += u
    for (const line of lines) {
      if (!line.productId) continue
      bucket.productIds.add(line.productId)
      const pk = `${dept}\0${line.productId}`
      const row = deptProductUnits.get(pk) ?? { department: dept, productId: line.productId, units: 0 }
      row.units += line.quantity
      deptProductUnits.set(pk, row)
    }

    const cur = deptStats.get(dept) ?? { requestCount: 0, requestedUnits: 0 }
    cur.requestCount += 1
    cur.requestedUnits += u
    deptStats.set(dept, cur)
  }

  const deliverySnapshots = await fetchDeliverySnapshotsForRequestIds(db, requestIdsInPeriod)
  const deliveries = deliverySnapshots.map((s) => s.delivery)
  const deliveredByReq = deliveredUnitsByRequestId(deliveries)
  const deliveredUnitsLinked = sumDeliveredForRequestIds(deliveredByReq, requestIdsInPeriod)

  const firstDeliveredMsByRequest = new Map<string, number>()
  for (const s of deliverySnapshots) {
    const rid = String(s.delivery.requestId || '').trim()
    if (!rid || s.deliveredAtMs == null) continue
    const prev = firstDeliveredMsByRequest.get(rid)
    if (prev == null || s.deliveredAtMs < prev) {
      firstDeliveredMsByRequest.set(rid, s.deliveredAtMs)
    }
  }

  let requestsWithSomeDelivery = 0
  let requestsPendingNoDelivery = 0
  let sumDaysToFirst = 0
  let countDaysToFirst = 0

  for (const rid of requestIdsInPeriod) {
    const delU = deliveredByReq.get(rid) ?? 0
    if (delU > 0) {
      requestsWithSomeDelivery += 1
    }
    const meta = requestMetaById.get(rid)
    if (meta && meta.status !== 'cancelled' && delU === 0) {
      requestsPendingNoDelivery += 1
    }
    if (meta && delU > 0) {
      const firstMs = firstDeliveredMsByRequest.get(rid)
      if (firstMs != null && firstMs >= meta.createdMs) {
        sumDaysToFirst += (firstMs - meta.createdMs) / 86_400_000
        countDaysToFirst += 1
      }
    }
  }

  let deliveriesWithOpenDispute = 0
  for (const s of deliverySnapshots) {
    if (!s.correctionOpen) continue
    const rid = String(s.delivery.requestId || '').trim()
    if (rid && requestMetaById.has(rid)) {
      deliveriesWithOpenDispute += 1
    }
  }

  const cancelledRequestsInPeriod = byStatus.cancelled ?? 0
  const requestsInRequestsTab = byStatus.submitted ?? 0
  const requestsInPreparationTab = byStatus.sent_to_rrhh ?? 0
  const requestsInReceptionTab = byStatus.prepared ?? 0
  const requestsInDeliveriesTab =
    (byStatus.ready_for_worker_delivery ?? 0) + (byStatus.picked_up ?? 0)
  const requestsClosed = (byStatus.receipt_confirmed ?? 0) + (byStatus.fulfilled ?? 0)

  const avgDaysToFirstDelivery =
    countDaysToFirst > 0 ? Math.round((100 * sumDaysToFirst) / countDaysToFirst) / 100 : null

  const pctDeliveredVsRequested =
    requestedUnitsInPeriod > 0
      ? Math.round((1000 * deliveredUnitsLinked) / requestedUnitsInPeriod) / 10
      : null

  const topProdEntries = topNFromMap(qtyByProduct, TOP_N)
  const labelByProduct = await productLabelsById(db, topProdEntries.map((e) => e.key))

  const topProducts: RrhhTopProduct[] = topProdEntries.map((e) => ({
    productId: e.key,
    label: labelByProduct.get(e.key) ?? e.key,
    quantity: e.value,
    shareOfRequestedPct:
      requestedUnitsInPeriod > 0
        ? Math.round((1000 * e.value) / requestedUnitsInPeriod) / 10
        : 0,
  }))

  const topDepartments: RrhhTopDepartment[] = [...deptStats.entries()]
    .map(([department, v]) => ({
      department,
      requestCount: v.requestCount,
      requestedUnits: v.requestedUnits,
      shareOfRequestedPct:
        requestedUnitsInPeriod > 0
          ? Math.round((1000 * v.requestedUnits) / requestedUnitsInPeriod) / 10
          : 0,
    }))
    .sort((a, b) => b.requestedUnits - a.requestedUnits || b.requestCount - a.requestCount)
    .slice(0, TOP_N)

  const { startMs: winStart, endMs: winEnd } = windowUtcRange(window)
  const dayList = eachUtcCalendarDayBetween(winStart, winEnd)
  const dailyActivity = dayList.map((day) => {
    const b = dailyBuckets.get(day)
    return {
      day,
      requestCount: b?.requestCount ?? 0,
      requestedUnits: b?.requestedUnits ?? 0,
      distinctProductsRequested: b?.productIds.size ?? 0,
    }
  })

  const mixSorted = [...deptProductUnits.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, DEPT_ARTICLE_TOP)
  const mixIds = [...new Set(mixSorted.map((m) => m.productId))]
  const mixLabelById = await productLabelsById(db, mixIds)
  const deptArticleMix = mixSorted.map((m) => ({
    department: m.department,
    productId: m.productId,
    productLabel: mixLabelById.get(m.productId) ?? m.productId,
    units: m.units,
  }))

  const periodDays =
    window.mode === 'rolling'
      ? window.days
      : Math.max(1, Math.ceil((window.toMs - window.fromMs) / 86_400_000))

  const payload: RrhhRobaOverview = {
    periodDays,
    totalRequests,
    byStatus,
    requestsInRequestsTab,
    requestsInPreparationTab,
    requestsInReceptionTab,
    requestsInDeliveriesTab,
    requestsClosed,
    requestedUnitsInPeriod,
    deliveredUnitsLinked,
    pctDeliveredVsRequested,
    requestsWithSomeDelivery,
    requestsPendingNoDelivery,
    avgDaysToFirstDelivery,
    deliveriesWithOpenDispute,
    cancelledRequestsInPeriod,
    topProducts,
    topDepartments,
    dailyActivity,
    deptArticleMix,
    datasetScanLimit: FETCH_LIMIT,
    dataSources: ['app'],
    reportContext: buildReportContext(window, filters),
  }

  return payload
}

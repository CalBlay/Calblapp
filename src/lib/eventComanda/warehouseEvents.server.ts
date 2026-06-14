import { firestoreAdmin as db } from '@/lib/firebaseAdmin'
import {
  normalizeEventComandaBatchStatus,
  PREPARER_HISTORY_BATCH_STATUSES,
  PREPARER_VISIBLE_BATCH_STATUSES,
} from '@/lib/eventComanda/batchStatus'
import { EVENT_COMANDA_COLLECTIONS } from '@/lib/eventComanda/collections'
import {
  canViewAllEventComandaWarehouses,
  listWarehouseIdsForUser,
} from '@/lib/eventComanda/warehouseMembers.server'
import { warehouseDocId } from '@/lib/eventComanda/warehouses.server'

import type {
  EventComandaBatchStatus,
  WarehouseComandaEventBatchChip,
} from '@/lib/eventComanda/types'

type OrderDoc = {
  sentAt?: number
  preparerVisibleWarehouseIds?: string[]
  preparerHistoryWarehouseIds?: string[]
  batches?: Array<{
    batchId?: string
    warehouseId?: string
    warehouseCode?: string
    warehouseName?: string
    status?: string
    lines?: unknown[]
  }>
}

export type WarehouseComandaEventCard = {
  id: string
  summary: string
  start: string
  end: string | null
  day: string
  location: string
  locationShort: string
  horaInici?: string
  eventCode: string | null
  pax: number
  lnKey: string
  lnLabel: string
  state: 'pending' | 'draft' | 'confirmed'
  name: string
  warehouseBatches?: WarehouseComandaEventBatchChip[]
}

const ORDERS_COL = EVENT_COMANDA_COLLECTIONS.orders
const STAGE_COL = 'stage_verd'

const dayKey = (iso?: string) => (iso || '').slice(0, 10)

function firstDocString(d: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = d[k]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t) return t
    }
  }
  return null
}

function computeLocationShort(full = '') {
  if (!full) return ''
  const cut = full.split(/[,\|\.]/)[0]?.trim() || full.trim()
  return cut.length > 30 ? `${cut.slice(0, 30)}...` : cut
}

function eventOverlapsRange(dataInici: string, dataFi: string | null, startDay: string, endDay: string) {
  const start = dataInici.slice(0, 10)
  const end = (dataFi || dataInici).slice(0, 10)
  if (!start) return false
  const normalizedEnd = end < start ? start : end
  return start <= endDay && normalizedEnd >= startDay
}

function orderHasWarehouseBatch(
  data: OrderDoc | undefined,
  allowedWarehouseIds: Set<string>,
  visibleStatuses: Set<EventComandaBatchStatus> = PREPARER_VISIBLE_BATCH_STATUSES
): boolean {
  if (!data?.sentAt) return false
  const batches = Array.isArray(data.batches) ? data.batches : []
  return batches.some((batch) => {
    const warehouseId = warehouseDocId(batch.warehouseId || '')
    const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
    if (!lineCount || !allowedWarehouseIds.has(warehouseId)) return false
    const status = normalizeEventComandaBatchStatus(batch.status)
    return visibleStatuses.has(status)
  })
}

async function queryOrderEventIdsByWarehouseField(
  field: 'preparerVisibleWarehouseIds' | 'preparerHistoryWarehouseIds',
  warehouseIds: string[]
): Promise<string[]> {
  const ids = new Set<string>()
  const uniqueWarehouseIds = [...new Set(warehouseIds.map((id) => warehouseDocId(id)).filter(Boolean))]

  for (let offset = 0; offset < uniqueWarehouseIds.length; offset += 10) {
    const chunk = uniqueWarehouseIds.slice(offset, offset + 10)
    if (!chunk.length) continue

    const snap = await db.collection(ORDERS_COL).where(field, 'array-contains-any', chunk).get()
    for (const doc of snap.docs) {
      ids.add(doc.id)
    }
  }

  return [...ids]
}

async function listOrderEventIdsForWarehouses(
  allowed: Set<string> | null,
  visibleStatuses?: Set<EventComandaBatchStatus>
): Promise<string[]> {
  const statuses = visibleStatuses || PREPARER_VISIBLE_BATCH_STATUSES
  const useHistoryField = statuses === PREPARER_HISTORY_BATCH_STATUSES

  if (allowed === null) {
    const snap = await db.collection(ORDERS_COL).where('sentAt', '>', 0).select('sentAt').get()
    return snap.docs.map((doc) => doc.id)
  }

  if (!allowed.size) return []

  const field = useHistoryField
    ? 'preparerHistoryWarehouseIds'
    : 'preparerVisibleWarehouseIds'

  const indexedIds = await queryOrderEventIdsByWarehouseField(field, [...allowed])
  if (indexedIds.length) return indexedIds

  // Compatibilitat amb comandes antigues sense índex de magatzems.
  const snap = await db.collection(ORDERS_COL).where('sentAt', '>', 0).get()
  const eventIds: string[] = []

  for (const doc of snap.docs) {
    const data = doc.data() as OrderDoc
    if (orderHasWarehouseBatch(data, allowed, statuses)) {
      eventIds.push(doc.id)
    }
  }

  return [...new Set(eventIds)]
}

async function resolveAllowedWarehouseIds(userId: string, role?: string | null) {
  if (canViewAllEventComandaWarehouses(role)) {
    return null
  }
  const assignedWarehouseIds = await listWarehouseIdsForUser(userId)
  if (!assignedWarehouseIds.length) return new Set<string>()
  return new Set(assignedWarehouseIds.map((id) => warehouseDocId(id)))
}

function extractVisibleWarehouseBatches(
  data: OrderDoc | undefined,
  allowed: Set<string> | null,
  visibleStatuses: Set<EventComandaBatchStatus>
): WarehouseComandaEventBatchChip[] {
  if (!data?.sentAt) return []
  const batches = Array.isArray(data.batches) ? data.batches : []
  const chips: WarehouseComandaEventBatchChip[] = []

  for (const batch of batches) {
    const warehouseId = warehouseDocId(batch.warehouseId || '')
    if (allowed !== null && !allowed.has(warehouseId)) continue
    const lineCount = Array.isArray(batch.lines) ? batch.lines.length : 0
    if (!lineCount) continue
    const status = normalizeEventComandaBatchStatus(batch.status)
    if (!visibleStatuses.has(status)) continue
    chips.push({
      batchId: String(batch.batchId || batch.warehouseId || warehouseId).trim(),
      warehouseId,
      warehouseCode: String(batch.warehouseCode || '').trim(),
      warehouseName: String(batch.warehouseName || '').trim(),
      status,
      lineCount,
    })
  }

  return chips.sort((a, b) =>
    (a.warehouseName || a.warehouseCode || a.warehouseId).localeCompare(
      b.warehouseName || b.warehouseCode || b.warehouseId,
      'ca'
    )
  )
}

async function listWarehouseComandaEventsInRange(params: {
  userId: string
  role?: string | null
  startDay: string
  endDay: string
  visibleStatuses: Set<EventComandaBatchStatus>
}): Promise<WarehouseComandaEventCard[]> {
  const startDay = String(params.startDay || '').slice(0, 10)
  const endDay = String(params.endDay || '').slice(0, 10)
  if (!startDay || !endDay) return []

  const allowed = await resolveAllowedWarehouseIds(params.userId, params.role)
  if (allowed && allowed.size === 0) return []

  const orderEventIds = await listOrderEventIdsForWarehouses(allowed, params.visibleStatuses)
  if (!orderEventIds.length) return []

  const cards: WarehouseComandaEventCard[] = []

  for (let offset = 0; offset < orderEventIds.length; offset += 100) {
    const chunk = orderEventIds.slice(offset, offset + 100)
    const orderRefs = chunk.map((eventId) => db.collection(ORDERS_COL).doc(eventId))
    const stageRefs = chunk.map((eventId) => db.collection(STAGE_COL).doc(eventId))
    const [orderSnaps, stageSnaps] = await Promise.all([
      db.getAll(...orderRefs),
      db.getAll(...stageRefs),
    ])

    for (let index = 0; index < chunk.length; index += 1) {
      const orderSnap = orderSnaps[index]
      const snap = stageSnaps[index]
      const orderData = orderSnap.exists ? (orderSnap.data() as OrderDoc) : undefined
      const warehouseBatches = extractVisibleWarehouseBatches(
        orderData,
        allowed,
        params.visibleStatuses
      )
      if (!warehouseBatches.length) continue

      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null
      const dataInici =
        (data && firstDocString(data, ['DataInici', 'dataInici', 'start'])) || ''
      const dataFi = data ? firstDocString(data, ['DataFi', 'dataFi', 'end']) : null

      if (data && dataInici && eventOverlapsRange(dataInici, dataFi, startDay, endDay)) {
        const card = mapStageDocToCard(snap.id, data, dataInici.slice(0, 10) || startDay)
        if (card) cards.push({ ...card, warehouseBatches })
        continue
      }

      if (!data) {
        cards.push({
          id: snap.id,
          summary: 'Esdeveniment amb comanda',
          name: 'Esdeveniment amb comanda',
          start: `${startDay}T00:00:00.000Z`,
          end: null,
          day: startDay,
          location: '',
          locationShort: '',
          eventCode: null,
          pax: 0,
          lnKey: 'altres',
          lnLabel: 'Altres',
          state: 'confirmed',
          warehouseBatches,
        })
      }
    }
  }

  return cards.sort((a, b) => a.day.localeCompare(b.day) || a.summary.localeCompare(b.summary, 'ca'))
}

function mapStageDocToCard(
  docId: string,
  data: Record<string, unknown>,
  occurrenceDay: string
): WarehouseComandaEventCard | null {
  const dataInici = firstDocString(data, ['DataInici', 'dataInici', 'start']) || ''
  const dataFi = firstDocString(data, ['DataFi', 'dataFi', 'end'])
  const startISO = dataInici ? `${dataInici.slice(0, 10)}T00:00:00.000Z` : null
  const endISO = dataFi ? `${dataFi.slice(0, 10)}T00:00:00.000Z` : startISO

  const rawSummary = String(data.NomEvent ?? data.summary ?? '(Sense títol)')
  const summary = rawSummary.split('/')[0].trim()

  const rawLocation = typeof data.Ubicacio === 'string' ? data.Ubicacio : String(data.Ubicacio ?? '')
  const location = rawLocation
    .split('(')[0]
    .split('/')[0]
    .replace(/^ZZRestaurant\s*/i, '')
    .replace(/^ZZ\s*/i, '')
    .trim()

  const rawHora =
    typeof data.HoraInici === 'string'
      ? data.HoraInici
      : typeof data.horaInici === 'string'
        ? data.horaInici
        : typeof data.Hora === 'string'
          ? data.Hora
          : typeof data.hora === 'string'
            ? data.hora
            : ''
  const horaInici = typeof rawHora === 'string' ? rawHora.trim().slice(0, 5) : undefined

  const eventCode = firstDocString(data, ['code', 'Code', 'C_digo', 'codi', 'Codi'])
  const lnValue = data.LN != null && data.LN !== '' ? String(data.LN) : 'Altres'

  return {
    id: docId,
    summary,
    name: summary,
    start: startISO || `${occurrenceDay}T00:00:00.000Z`,
    end: endISO,
    day: occurrenceDay,
    location,
    locationShort: computeLocationShort(location),
    horaInici: horaInici || undefined,
    eventCode: eventCode ? eventCode.toUpperCase() : null,
    pax: Number(data.NumPax ?? 0) || 0,
    lnKey: lnValue.toLowerCase(),
    lnLabel: lnValue,
    state: 'confirmed',
  }
}

export async function listWarehouseComandaEventsForUser(params: {
  userId: string
  role?: string | null
  startDay: string
  endDay: string
}): Promise<WarehouseComandaEventCard[]> {
  return listWarehouseComandaEventsInRange({
    ...params,
    visibleStatuses: PREPARER_VISIBLE_BATCH_STATUSES,
  })
}

export async function listWarehouseComandaHistoryEventsForUser(params: {
  userId: string
  role?: string | null
  startDay: string
  endDay: string
}): Promise<WarehouseComandaEventCard[]> {
  return listWarehouseComandaEventsInRange({
    ...params,
    visibleStatuses: PREPARER_HISTORY_BATCH_STATUSES,
  })
}

export async function filterEventIdsWithWarehouseOrders(
  eventIds: string[],
  userId: string,
  role?: string | null
): Promise<string[]> {
  const allowed = await resolveAllowedWarehouseIds(userId, role)
  if (allowed && allowed.size === 0) return []
  if (allowed === null) {
    return [...new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))]
  }

  const uniqueIds = [...new Set(eventIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!uniqueIds.length) return []

  const matched: string[] = []

  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const chunk = uniqueIds.slice(offset, offset + 100)
    const refs = chunk.map((eventId) => db.collection(ORDERS_COL).doc(eventId))
    const snaps = await db.getAll(...refs)

    for (const snap of snaps) {
      if (!snap.exists) continue
      const data = snap.data() as OrderDoc
      if (orderHasWarehouseBatch(data, allowed)) {
        matched.push(snap.id)
      }
    }
  }

  return matched
}

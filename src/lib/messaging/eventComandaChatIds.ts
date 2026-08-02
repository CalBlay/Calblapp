import type { EventComandaOrderBatch } from '@/lib/eventComanda/types'
import { warehouseDocId } from '@/lib/eventComanda/warehouseIds'

export const EVENT_COMANDA_ROOM_BATCH_SEPARATOR = '__'

export function eventComandaBatchIdentity(
  batch: Pick<EventComandaOrderBatch, 'batchId' | 'warehouseId'>
) {
  return String(batch.batchId || batch.warehouseId).trim()
}

/** Canal legacy (lot principal) o per lot addicional. */
export function buildEventComandaChannelId(
  eventId: string,
  warehouseId: string,
  batchId?: string | null
) {
  const eventKey = String(eventId || '').trim()
  const warehouseKey = warehouseDocId(warehouseId)
  const batchKey = String(batchId || '').trim()
  if (!eventKey || !warehouseKey) return ''
  if (!batchKey || batchKey === warehouseKey) {
    return `event_comanda_${eventKey}_${warehouseKey}`
  }
  return `event_comanda_${eventKey}_${warehouseKey}_${batchKey}`
}

export function defaultChannelIdForBatch(eventId: string, batch: EventComandaOrderBatch) {
  const warehouseKey = warehouseDocId(batch.warehouseId)
  const batchKey = eventComandaBatchIdentity(batch)
  if (batch.kind === 'revision') {
    return buildEventComandaChannelId(eventId, warehouseKey, batchKey)
  }
  return buildEventComandaChannelId(eventId, warehouseKey)
}

export function resolveEventComandaBatchChannelId(eventId: string, batch: EventComandaOrderBatch) {
  const stored = String(batch.opsChannelId || '').trim()
  if (stored) return stored
  return defaultChannelIdForBatch(eventId, batch)
}

export function buildEventComandaRoomId(warehouseId: string, batchId: string) {
  const warehouseKey = warehouseDocId(warehouseId)
  const batchKey = String(batchId || warehouseKey).trim()
  return `comanda-${warehouseKey}${EVENT_COMANDA_ROOM_BATCH_SEPARATOR}${batchKey}`
}

export function buildEventComandaRoomIdFromBatch(batch: EventComandaOrderBatch) {
  return buildEventComandaRoomId(batch.warehouseId, eventComandaBatchIdentity(batch))
}

export function parseEventComandaRoomId(roomId: string) {
  const raw = String(roomId || '').trim()
  if (!raw.startsWith('comanda-')) return null
  const rest = raw.slice('comanda-'.length)
  const sep = rest.indexOf(EVENT_COMANDA_ROOM_BATCH_SEPARATOR)
  if (sep === -1) {
    const warehouseId = rest.trim()
    return warehouseId ? { warehouseId, batchId: null as string | null } : null
  }
  const warehouseId = rest.slice(0, sep).trim()
  const batchId = rest.slice(sep + EVENT_COMANDA_ROOM_BATCH_SEPARATOR.length).trim()
  if (!warehouseId || !batchId) return null
  return { warehouseId, batchId }
}

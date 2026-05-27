import {
  entregaDeliveredTotalUnits,
  robaLinesQtyByProduct,
} from '@/app/menu/roba-personal/robaDeliveryHelpers'
import type { DeliveryRow } from '@/app/menu/roba-personal/robaPersonalTypes'

type ReqLine = { productId: string; quantity: number }

/** Converteix `createdAt` / `deliveredAt` Firestore o ISO a ms UTC. */
export function firestoreDateToMs(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    const d = (raw as { toDate: () => Date }).toDate()
    const t = d.getTime()
    return Number.isFinite(t) ? t : null
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : null
  }
  return null
}

export type DeliverySnapshot = {
  delivery: DeliveryRow
  deliveredAtMs: number | null
  workerReceiptAckAtMs: number | null
  correctionOpen: boolean
}

export function deliverySnapshotFromFirestore(id: string, data: Record<string, unknown>): DeliverySnapshot {
  const delivery = deliveryRowFromFirestore(id, data)
  return {
    delivery,
    deliveredAtMs: firestoreDateToMs(data.deliveredAt),
    workerReceiptAckAtMs: firestoreDateToMs(data.workerReceiptAckAt),
    correctionOpen: data.workerReceiptCorrectionOpen === true,
  }
}

export function requestedLinesFromRequestDoc(data: Record<string, unknown>): ReqLine[] {
  const orig = data.originalRequestedLines
  if (Array.isArray(orig) && orig.length > 0) {
    return normalizeLines(orig)
  }
  return normalizeLines(data.lines)
}

function normalizeLines(raw: unknown): ReqLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((l) => ({
      productId: String((l as { productId?: string }).productId || '').trim(),
      quantity: Number((l as { quantity?: number }).quantity),
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
}

export function sumLineQuantities(lines: ReqLine[]): number {
  return lines.reduce((a, l) => a + l.quantity, 0)
}

export function deliveryRowFromFirestore(
  id: string,
  data: Record<string, unknown>
): DeliveryRow {
  return {
    id,
    workerId: String(data.workerId || ''),
    lines: normalizeLines(data.lines),
    requestId: data.requestId != null ? String(data.requestId) : null,
    requestedLines: Array.isArray(data.requestedLines)
      ? normalizeLines(data.requestedLines)
      : null,
  }
}

/** Agrupa quantitats sol·licitades per producte (per top articles). */
export function mergeQtyMaps(
  into: Map<string, number>,
  lines: ReqLine[]
): void {
  const m = robaLinesQtyByProduct(lines)
  for (const [k, v] of m) {
    into.set(k, (into.get(k) ?? 0) + v)
  }
}

export function topNFromMap(m: Map<string, number>, n: number): { key: string; value: number }[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, value }))
}

/** Suma unitats lliurades per sol·licitud (una passada sobre les entregues). */
export function deliveredUnitsByRequestId(deliveries: DeliveryRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of deliveries) {
    const rid = String(d.requestId || '').trim()
    if (!rid) continue
    const u = entregaDeliveredTotalUnits(d)
    m.set(rid, (m.get(rid) ?? 0) + u)
  }
  return m
}

export function sumDeliveredForRequestIds(
  byRequest: Map<string, number>,
  requestIds: string[]
): number {
  let t = 0
  for (const id of requestIds) {
    t += byRequest.get(id) ?? 0
  }
  return t
}

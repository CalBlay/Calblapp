import type { DeliveryRow } from './robaPersonalTypes'

export function deliveryReceptionFilterKey(r: DeliveryRow): 'pending' | 'dispute' | 'done' {
  if (r.workerReceiptCorrectionOpen) return 'dispute'
  if (r.workerReceiptAckExpected && !r.workerReceiptAckAt) return 'pending'
  return 'done'
}

export function robaLinesQtyByProduct(
  lines: { productId: string; quantity: number }[] | null | undefined
): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines || []) {
    const id = String(l.productId || '').trim()
    const q = Number(l.quantity)
    if (!id || !Number.isFinite(q) || q <= 0) continue
    m.set(id, (m.get(id) ?? 0) + q)
  }
  return m
}

export function robaDeliveryRequestedMatchesDelivered(d: DeliveryRow): boolean {
  const req = d.requestedLines
  if (!req?.length) return true
  const a = robaLinesQtyByProduct(req)
  const b = robaLinesQtyByProduct(d.lines)
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false
  }
  return true
}

export function entregaDeliveredTotalUnits(r: DeliveryRow): number {
  return (r.lines || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0)
}

export function entregaRequestedTotalUnits(r: DeliveryRow): number {
  return (r.requestedLines || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0)
}

export function entregaEstatLabelForLead(r: DeliveryRow): string {
  if (r.workerReceiptCorrectionOpen) return 'Incidència'
  if (r.workerReceiptAckExpected && !r.workerReceiptAckAt) return 'Pendent confirmació'
  if (r.workerReceiptAckAt) return 'Confirmada'
  return 'Registrada'
}

/** Suma les quantitats lliurades per `productId` de totes les entregues vinculades a una sol·licitud. */
export function deliveredQtyByProductForRequestId(
  deliveries: DeliveryRow[],
  requestId: string
): Map<string, number> {
  const rid = String(requestId || '').trim()
  if (!rid) return new Map()
  const acc = new Map<string, number>()
  for (const d of deliveries) {
    if (String(d.requestId || '').trim() !== rid) continue
    const m = robaLinesQtyByProduct(d.lines)
    for (const [k, v] of m) {
      acc.set(k, (acc.get(k) ?? 0) + v)
    }
  }
  return acc
}

export function totalDeliveredUnitsForRequest(deliveries: DeliveryRow[], requestId: string): number {
  let t = 0
  for (const q of deliveredQtyByProductForRequestId(deliveries, requestId).values()) {
    t += q
  }
  return t
}

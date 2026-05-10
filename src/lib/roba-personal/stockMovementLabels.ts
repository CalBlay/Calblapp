/** Motius de moviment d'estoc reversibles des de la pestanya Estoc (entrada/ajust manual). */
export const REVERSIBLE_MANUAL_STOCK_REASONS = new Set([
  'manual',
  'manual_adjust',
  'manual_purchase',
  'manual_return',
])

export function isReversibleManualStockReason(reason: string | undefined | null): boolean {
  const r = String(reason || 'manual').trim() || 'manual'
  return REVERSIBLE_MANUAL_STOCK_REASONS.has(r)
}

const LABELS: Record<string, string> = {
  manual: 'Ajust manual',
  manual_adjust: 'Ajust / inventari',
  manual_purchase: 'Compra / entrada',
  manual_return: 'Devolució de departament',
  department_pickup: 'Recollida del departament',
  department_validation: 'Validació del responsable',
  delivery: 'Entrega a treballador',
  delivery_correction: "Correcció d'entrega",
  delivery_delete: "Anul·lació d'entrega",
  request_reserve: 'Preparació · reserva al magatzem',
  request_reserve_release: 'Alliberament de reserva',
}

/** Etiqueta en català per al motiu emmagatzemat al moviment. */
export function labelStockMovementReason(reason: string | undefined | null): string {
  const r = String(reason || '').trim()
  if (!r) return '—'
  return LABELS[r] || r
}

/**
 * Etiqueta per a la UI (Tipus), tenint en compte l'estat de l'entrega vinculada quan escau:
 * preparació → recollida del departament → entrega al treballador.
 */
export function labelStockMovementReasonDisplay(m: {
  reason?: string | null
  /** Enriquit al GET de moviments quan hi ha document d'entrega. */
  deliveryWorkerAckPending?: boolean | null
}): string {
  const reason = String(m.reason || '').trim()
  if (reason === 'delivery') {
    if (m.deliveryWorkerAckPending === true) {
      return 'Entrega pel responsable (pendent recepció treballador)'
    }
    return 'Entrega a treballador'
  }
  return labelStockMovementReason(reason)
}

/** Text per a la columna de reserva als moviments (canvi i/o estat després del moviment). */
export function stockMovementReservaLabel(m: {
  quantityReservedDelta?: number | null
  productReservedAfter?: number | null
}): string {
  const rawD = m.quantityReservedDelta
  if (rawD != null && Number.isFinite(Number(rawD)) && Number(rawD) !== 0) {
    const n = Number(rawD)
    return `${n > 0 ? '+' : ''}${n} res.`
  }
  const after = m.productReservedAfter
  if (after != null && Number.isFinite(Number(after))) {
    return `${Number(after)} u. res.`
  }
  return '—'
}

export function stockMovementDepartmentLabel(m: {
  requestingDepartment?: string | null
  workerDepartment?: string | null
}): string {
  const req = String(m.requestingDepartment || '').trim()
  if (req) return req
  const w = String(m.workerDepartment || '').trim()
  if (w) return w
  return '—'
}

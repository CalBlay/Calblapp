/**
 * Prefixos de referència (auditoria):
 * S- sol·licitud (document sol·licitud)
 * E- entrega (document entrega i cada moviment d’estoc generat)
 * A- ajust / entrada manual d’estoc
 */

export function requestReferenceFromDocId(docId: string): string {
  return `S-${docId}`
}

/**
 * Accepta l’id real del document Firestore o la referència «S-…» que es mostra a la UI
 * (sovint els usuaris enganxen la referència sencera al camp manual).
 */
export function robaRequestDocIdFromInput(raw: string): string {
  const t = String(raw || '').trim()
  if (!t) return ''
  const m = /^S-(.+)$/i.exec(t)
  if (m) return m[1].trim()
  return t
}

export function deliveryRecordReferenceFromDocId(docId: string): string {
  return `E-${docId}`
}

/** Moviment d’estoc vinculat a una entrega (una línia → un document moviment). */
export function deliveryStockMovementReferenceFromDocId(movementDocId: string): string {
  return `E-${movementDocId}`
}

/** Moviment d’estoc manual (entrada o ajust amb quantitat ±). */
export function adjustmentStockMovementReferenceFromDocId(movementDocId: string): string {
  return `A-${movementDocId}`
}

/**
 * Línies de sol·licitud en el mateix format que les d’entrega (per comparació i auditoria).
 */
export type RobaDotacioLine = { productId: string; quantity: number; notes?: string }

/** Línies des del document de sol·licitud Firestore (camp `lines`). */
export function linesFromRequestSnapshot(data: Record<string, unknown>): RobaDotacioLine[] {
  const linesIn = Array.isArray(data.lines) ? data.lines : []
  return linesIn
    .map((l) => {
      const productId = String((l as { productId?: string }).productId || '').trim()
      const quantity = Number((l as { quantity?: number }).quantity)
      const notesTrim = String((l as { notes?: string }).notes || '').trim()
      const entry: RobaDotacioLine = { productId, quantity }
      if (notesTrim) entry.notes = notesTrim
      return entry
    })
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0)
}

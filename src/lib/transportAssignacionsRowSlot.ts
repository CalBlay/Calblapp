/**
 * IDs sintètics del GET assignacions quan el conductor encara no té `id` a Firestore:
 * `pending:${quadrantDocumentId}:${indexDinsConductors}`
 * El document id pot contenir `:`; l'índex és sempre el segment final després de l'últim `:`.
 */
export function parsePendingAssignacionsRowId(rowId: string | undefined | null): {
  quadrantDocId: string
  conductorIndex: number
} | null {
  if (!rowId || typeof rowId !== 'string') return null
  if (!rowId.startsWith('pending:')) return null
  const rest = rowId.slice('pending:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon < 0) return null
  const idx = parseInt(rest.slice(lastColon + 1), 10)
  if (!Number.isInteger(idx) || idx < 0) return null
  const quadrantDocId = rest.slice(0, lastColon)
  if (!quadrantDocId.trim()) return null
  return { quadrantDocId, conductorIndex: idx }
}

export function parseConductorSlotIndex(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10)
    return n >= 0 ? n : null
  }
  return null
}

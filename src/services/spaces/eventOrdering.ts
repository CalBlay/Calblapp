import { manualIdToCreatedAtIso } from './manualReserveZohoMatch'

type FirestoreCreateTimeLike = { toMillis: () => number }

function toCreatedAtMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (value && typeof value === 'object' && 'toDate' in (value as object)) {
    const date = (value as { toDate?: () => Date }).toDate?.()
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
  }
  return 0
}

/** Milliseconds for ordering events in a cell (oldest first). */
export function eventCreatedAtMs(
  data: Record<string, unknown>,
  docId: string,
  firestoreCreateTime?: FirestoreCreateTimeLike
): number {
  const fromManualReserveCreatedAt = toCreatedAtMs(data.manualReserveCreatedAt)
  if (fromManualReserveCreatedAt > 0) return fromManualReserveCreatedAt

  const mergedFromManualId = data.mergedFromManualId
    ? String(data.mergedFromManualId)
    : ''
  if (mergedFromManualId) {
    const fromManualId = manualIdToCreatedAtIso(mergedFromManualId)
    if (fromManualId) {
      const ms = new Date(fromManualId).getTime()
      if (!Number.isNaN(ms)) return ms
    }
    if (firestoreCreateTime) return firestoreCreateTime.toMillis()
    return Number.MAX_SAFE_INTEGER
  }

  const fromCreatedAt = toCreatedAtMs(data.createdAt)
  if (fromCreatedAt > 0) return fromCreatedAt

  const fromDataPeticio = toCreatedAtMs(data.DataPeticio)
  if (fromDataPeticio > 0) return fromDataPeticio

  if (firestoreCreateTime) return firestoreCreateTime.toMillis()

  const manualMatch = /^spaces_manual_(\d+)$/.exec(docId)
  if (manualMatch) return Number(manualMatch[1])

  const legacyManualMatch = /^manual_(\d+)$/.exec(docId)
  if (legacyManualMatch) return Number(legacyManualMatch[1])

  return Number.MAX_SAFE_INTEGER
}

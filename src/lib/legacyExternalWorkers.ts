const LEGACY_EXTERNAL_WORKERS_FIELD = ['bri', 'gades'].join('')

export type LegacyExternalWorkerEntry = {
  workers?: unknown
  name?: unknown
  meetingPoint?: unknown
  startDate?: unknown
  startTime?: unknown
  endDate?: unknown
  endTime?: unknown
  arrivalTime?: unknown
}

export type ExpandedLegacyExternalWorker = {
  id: string
  name: string
  meetingPoint: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  arrivalTime: string
  plate: string
  vehicleType: string
  isExternal: true
}

export function readLegacyExternalWorkersFromDoc<T = Record<string, unknown>>(doc: unknown): T[] {
  if (!doc || typeof doc !== 'object') return []
  const raw = (doc as Record<string, unknown>)[LEGACY_EXTERNAL_WORKERS_FIELD]
  return Array.isArray(raw) ? (raw as T[]) : []
}

/**
 * Expands compacted legacy ETT entries (`{ name, workers: N, ... }`) into N
 * individual external worker rows used by quadrants list/get.
 */
export function expandLegacyExternalWorkers(
  entries: LegacyExternalWorkerEntry[] = []
): ExpandedLegacyExternalWorker[] {
  return entries.flatMap((entry) => {
    const count = Math.max(1, Number(entry?.workers || 0))
    const name = String(entry?.name || 'ETT').trim() || 'ETT'
    return Array.from({ length: count }, () => ({
      id: '',
      name,
      meetingPoint: String(entry?.meetingPoint || ''),
      startDate: String(entry?.startDate || ''),
      startTime: String(entry?.startTime || ''),
      endDate: String(entry?.endDate || ''),
      endTime: String(entry?.endTime || ''),
      arrivalTime: String(entry?.arrivalTime || ''),
      plate: '',
      vehicleType: '',
      isExternal: true as const,
    }))
  })
}

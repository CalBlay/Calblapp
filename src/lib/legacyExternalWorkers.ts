const LEGACY_EXTERNAL_WORKERS_FIELD = ['bri', 'gades'].join('')

export function readLegacyExternalWorkersFromDoc<T = Record<string, unknown>>(doc: unknown): T[] {
  if (!doc || typeof doc !== 'object') return []
  const raw = (doc as Record<string, unknown>)[LEGACY_EXTERNAL_WORKERS_FIELD]
  return Array.isArray(raw) ? (raw as T[]) : []
}

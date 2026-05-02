import type { DocumentData } from 'firebase-admin/firestore'

/** Converteix Timestamp de Firestore a ISO per a respostes JSON. */
export function serializeFirestoreDoc<T extends DocumentData>(
  id: string,
  data: T
): T & { id: string } {
  /** `id` del document ha de prevaldre: alguns docs dupliquen `id` al payload (buit/erroni). */
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>), id }
  for (const key of Object.keys(out)) {
    const v = out[key]
    if (
      v !== null &&
      typeof v === 'object' &&
      'toDate' in v &&
      typeof (v as { toDate?: () => Date }).toDate === 'function'
    ) {
      out[key] = (v as { toDate: () => Date }).toDate().toISOString()
    }
  }
  return out as T & { id: string }
}

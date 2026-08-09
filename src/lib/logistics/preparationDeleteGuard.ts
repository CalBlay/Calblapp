export const LOGISTICS_PREPARATION_SERVICES_COLLECTION =
  'logistics_preparation_services' as const
export const STAGE_VERD_COLLECTION = 'stage_verd' as const

export type LogisticsDeleteCollection =
  | typeof LOGISTICS_PREPARATION_SERVICES_COLLECTION
  | typeof STAGE_VERD_COLLECTION

export type LogisticsDeleteCandidate = {
  collectionName: LogisticsDeleteCollection
  id: string
  data?: Record<string, unknown> | null
}

/**
 * Preparació DELETE may remove service preparation rows, and manually created
 * stage_verd stubs from the preparació UI (`manual_*` / origen=manual).
 * Synced/calendar stage_verd events must never be deleted from this path.
 */
export function canDeleteLogisticsPreparationRow(
  candidate: LogisticsDeleteCandidate
): { ok: true } | { ok: false; error: string } {
  const id = String(candidate.id || '').trim()
  if (!id) {
    return { ok: false, error: 'Falta ID' }
  }

  if (candidate.collectionName === LOGISTICS_PREPARATION_SERVICES_COLLECTION) {
    return { ok: true }
  }

  if (candidate.collectionName !== STAGE_VERD_COLLECTION) {
    return { ok: false, error: 'Coleccio no permesa per eliminar' }
  }

  const origen = String(candidate.data?.origen ?? '').trim().toLowerCase()
  const isManualStub = id.startsWith('manual_') || origen === 'manual'
  if (!isManualStub) {
    return {
      ok: false,
      error:
        'No es pot eliminar un esdeveniment confirmat des de preparacio. Elimina nomes files de servei o files manuals.',
    }
  }

  return { ok: true }
}

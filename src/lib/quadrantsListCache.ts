import { revalidateTag } from 'next/cache'

/** Tag compartit amb `unstable_cache` de GET /api/quadrants/get */
export const QUADRANTS_LIST_CACHE_TAG = 'quadrants-list-by-range-v1'

export function revalidateQuadrantsListCache() {
  try {
    revalidateTag(QUADRANTS_LIST_CACHE_TAG)
  } catch (err) {
    console.warn('[quadrantsListCache] revalidateTag failed', err)
  }

  // Importacio dinamica per evitar carregar firebase-admin en codepaths
  // que nomes necessiten invalidar el tag (p. ex. routes light).
  void import('@/services/workloadLedger')
    .then(({ invalidateWorkloadLedgerCache }) => {
      try {
        invalidateWorkloadLedgerCache()
      } catch {}
    })
    .catch(() => {})
}

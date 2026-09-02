import { hasRestaurantKeyword } from '@/services/zoho/sync-finca-matching'

/** Fallback base when Firestore has no existing CEU#### codes yet. */
export const CEU_BASE_FALLBACK = 172

/** Parse a CEU code's numeric suffix (tolerant of non-4-digit forms). */
export function parseCeuNumber(code?: string | null): number {
  return Number(String(code || '').replace(/^CEU/i, ''))
}

/** Only accept strict CEU + exactly 4 digits (used when scanning existing finques). */
export function parseCeuNumberStrict4(code?: string | null): number | null {
  const normalized = String(code || '').trim().toUpperCase()
  const match = normalized.match(/^CEU(\d{4})$/)
  if (!match) return null
  const num = Number(match[1])
  return Number.isFinite(num) ? num : null
}

/** Allocate the next CEU#### after the current max (or CEU_BASE_FALLBACK). */
export function nextCEUCode(currentMaxNum: number | null): string {
  const nextNum = (currentMaxNum ?? CEU_BASE_FALLBACK) + 1
  return `CEU${String(nextNum).padStart(4, '0')}`
}

/**
 * LN (línia de negoci) assigned when creating a finca from a Zoho deal.
 * CCR / restaurant keywords → Grups Restaurants; CCB/CCE/CCF prefixes map fixed LNs;
 * CEU keeps the deal's LN; other codes get an empty LN.
 */
export function resolveFincaLnForNewCode(params: {
  code: string
  locationName: string
  dealLn?: string | null
}): string {
  const code = String(params.code || '').trim().toUpperCase()
  const forceGrupsRestaurants =
    code.startsWith('CCR') || hasRestaurantKeyword(params.locationName)
  if (forceGrupsRestaurants) return 'Grups Restaurants'
  if (code.startsWith('CCB')) return 'Casaments'
  if (code.startsWith('CCE')) return 'Empreses'
  if (code.startsWith('CCF')) return 'Foodlovers'
  if (code.startsWith('CEU')) return String(params.dealLn || '')
  return ''
}

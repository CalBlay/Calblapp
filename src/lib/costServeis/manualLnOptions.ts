/** Opcions LN habituals per serveis manuals / transports Disponibilitat.
 * Es desa el **nom** (com als events), no el codi ERP.
 * Restaurants (LN00001) ≡ Grups Restaurants → un sol valor canònic.
 */
export const MANUAL_LN_OPTIONS = [
  {
    value: 'Grups Restaurants',
    label: 'Grups Restaurants',
    code: 'LN00001',
  },
  { value: 'ATMETLLER', label: 'ATMETLLER' },
  { value: 'Precuinats', label: 'Precuinats', code: 'LN00004' },
  { value: 'Empresa', label: 'Empresa' },
  { value: 'Casaments', label: 'Casaments' },
  { value: 'Foodlovers', label: 'Foodlovers' },
  { value: 'Agenda', label: 'Agenda' },
  { value: 'Altres', label: 'Altres' },
] as const

/** Alias → nom canònic (mateix criteri que events / Zoho). */
const LN_ALIASES_TO_CANONICAL: Record<string, string> = {
  ln00001: 'Grups Restaurants',
  restaurants: 'Grups Restaurants',
  'grups restaurants': 'Grups Restaurants',
  restauracio: 'Grups Restaurants',
  restauració: 'Grups Restaurants',
  ametller: 'ATMETLLER',
  atmetller: 'ATMETLLER',
  ln00004: 'Precuinats',
  precuinats: 'Precuinats',
  empresa: 'Empresa',
  casaments: 'Casaments',
  foodlovers: 'Foodlovers',
  agenda: 'Agenda',
  altres: 'Altres',
}

function foldLn(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Normalitza codi ERP o alias → nom LN únic (com als events). */
export function normalizeManualLnName(raw?: string | null): string {
  const s = String(raw || '').trim()
  if (!s) return ''

  const folded = foldLn(s)
  const byAlias = LN_ALIASES_TO_CANONICAL[folded]
  if (byAlias) return byAlias

  // "Grups Restaurants (LN00001)" / "Restaurants (LN00001)"
  if (folded.includes('ln00001') || folded.includes('restaurant')) {
    return 'Grups Restaurants'
  }
  if (folded.includes('ln00004') || folded.includes('precuinat')) {
    return 'Precuinats'
  }

  const known = MANUAL_LN_OPTIONS.find((o) => foldLn(o.value) === folded)
  if (known) return known.value

  return s
}

/** Normalització de línies de negoci per filtres del mòdul Espais. */
export function normalizeSpacesLn(ln?: string | null): string {
  const n = (ln || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  if (!n) return ''
  if (n === 'restaurants' || n === 'restauracio') return 'grups restaurants'
  return n.replace(/\s+/g, ' ')
}

export function isGrupsRestaurantsLn(ln?: string | null): boolean {
  const n = normalizeSpacesLn(ln)
  if (!n) return false
  return n.includes('grup') && n.includes('restaurant')
}

export function spacesLnFilterMatches(
  ln: string | null | undefined,
  selectedFilters: string[],
  excludeGrupsRestaurants = false
): boolean {
  if (excludeGrupsRestaurants && isGrupsRestaurantsLn(ln)) return false
  if (selectedFilters.length === 0) return true

  const normalizedValue = normalizeSpacesLn(ln)
  if (!normalizedValue) return true

  return selectedFilters.some((filter) => {
    const normalizedFilter = normalizeSpacesLn(filter)
    if (!normalizedFilter) return false
    return (
      normalizedValue === normalizedFilter ||
      normalizedValue.includes(normalizedFilter) ||
      normalizedFilter.includes(normalizedValue)
    )
  })
}

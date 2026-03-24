export const DEFAULT_ALLERGENS = [
  { key: 'gluten', label: 'Gluten' },
  { key: 'crustacis', label: 'Crustacis' },
  { key: 'ou', label: 'Ou' },
  { key: 'peix', label: 'Peix' },
  { key: 'cacauet', label: 'Cacauet' },
  { key: 'soja', label: 'Soja' },
  { key: 'lactosa', label: 'Lactosa' },
  { key: 'fruitsSecs', label: 'Fruits secs' },
  { key: 'api', label: 'Api' },
  { key: 'mostassa', label: 'Mostassa' },
  { key: 'sesam', label: 'S\u00E8sam' },
  { key: 'sulfits', label: 'Sulfits' },
  { key: 'tramus', label: 'Tram\u00FAs' },
  { key: 'moluscs', label: 'Mol\u00B7luscs' },
] as const

export const ALLERGENS = DEFAULT_ALLERGENS

const ORDER_INDEX = new Map<string, number>(
  DEFAULT_ALLERGENS.map((item, index) => [item.key, index])
)

export function sortAllergensByStandardOrder<T extends { key: string; label: string }>(
  items: readonly T[]
): T[] {
  return [...items].sort((a, b) => {
    const aIndex = ORDER_INDEX.get(a.key)
    const bIndex = ORDER_INDEX.get(b.key)

    if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
    if (aIndex !== undefined) return -1
    if (bIndex !== undefined) return 1

    return a.label.localeCompare(b.label, 'ca')
  })
}

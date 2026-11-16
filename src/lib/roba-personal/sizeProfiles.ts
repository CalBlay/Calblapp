export const ROBA_SIZE_TYPE_VALUES = ['none', 'letters', 'numeric', 'custom'] as const

export type RobaSizeType = (typeof ROBA_SIZE_TYPE_VALUES)[number]

export const ROBA_LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] as const
export const ROBA_NUMERIC_SIZES = ['34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54', '56'] as const

export function isRobaSizeType(value: unknown): value is RobaSizeType {
  return ROBA_SIZE_TYPE_VALUES.includes(String(value) as RobaSizeType)
}

export function normalizeRobaSizeOptions(value: unknown): string[] {
  const input = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of input) {
    const size = String(item ?? '').trim().slice(0, 24)
    const key = size.toLocaleUpperCase('ca')
    if (!size || seen.has(key)) continue
    seen.add(key)
    result.push(size)
  }
  return result.slice(0, 40)
}

export function defaultRobaSizeOptions(type: RobaSizeType): string[] {
  if (type === 'letters') return [...ROBA_LETTER_SIZES]
  if (type === 'numeric') return [...ROBA_NUMERIC_SIZES]
  return []
}

export function robaSizesForFamily(type: unknown, options: unknown): string[] {
  if (!isRobaSizeType(type) || type === 'none') return []
  const normalized = normalizeRobaSizeOptions(options)
  return normalized.length > 0 ? normalized : defaultRobaSizeOptions(type)
}

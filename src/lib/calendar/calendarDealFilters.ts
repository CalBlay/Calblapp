export function normalizeCalendarFilterValue(value = '') {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function isCalendarAllFilter(value?: string) {
  const n = normalizeCalendarFilterValue(value || '')
  if (!n) return true
  if (n === 'all') return true
  if (n.startsWith('tots') || n.startsWith('totes')) return true
  return false
}

export function toCalendarArrayFilter(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string' && v.trim() && !isCalendarAllFilter(v))
  }
  const single = String(value || '').trim()
  if (!single) return []
  if (isCalendarAllFilter(single)) return []
  return [single]
}

export function dealMatchesCalendarLocationFilter(
  ubicacio: string | undefined,
  locationFilter?: string | string[]
): boolean {
  const values = toCalendarArrayFilter(locationFilter)
  if (!values.length) return true
  const locationSet = new Set(values.map(normalizeCalendarFilterValue))
  return locationSet.has(normalizeCalendarFilterValue(ubicacio || ''))
}

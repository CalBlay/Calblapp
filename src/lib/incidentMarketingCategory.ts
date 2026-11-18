export function shouldNotifyMarketingCategoryChange(
  previousCategoryId?: string | null,
  nextCategoryId?: string | null
) {
  const previous = String(previousCategoryId || '').trim()
  const next = String(nextCategoryId || '').trim()
  return Boolean(next.startsWith('9') && next !== previous)
}

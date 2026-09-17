type CalendarLocationDeal = {
  Ubicacio?: string
}

export function normalizeCalendarLocation(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function filterCalendarDealsByLocations<T extends CalendarLocationDeal>(
  deals: T[],
  selectedLocations: string[]
): T[] {
  if (!selectedLocations.length) return deals

  const selected = new Set(
    selectedLocations.map(normalizeCalendarLocation).filter(Boolean)
  )
  if (!selected.size) return deals

  return deals.filter((deal) =>
    selected.has(normalizeCalendarLocation(deal.Ubicacio))
  )
}

export function buildCalendarLocationOptions(
  deals: CalendarLocationDeal[]
): string[] {
  return Array.from(
    new Set(
      deals
        .map((deal) => (typeof deal.Ubicacio === 'string' ? deal.Ubicacio.trim() : ''))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ca', { sensitivity: 'base' }))
}

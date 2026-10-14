export const CALENDAR_SEARCH_MIN_LENGTH = 2

type CalendarSearchableDeal = {
  id?: string
  NomEvent?: string
  Comercial?: string
  ComercialIntern?: string
  Responsable?: string
  LN?: string
  Servei?: string
  StageGroup?: string
  DataInici?: string
  DataFi?: string
  Ubicacio?: string
  HoraInici?: string
  HoraFi?: string
  NumPax?: number | string | null
  ObservacionsZoho?: string
  code?: string
  codeStatus?: string
  cancelled?: boolean
  origen?: string
}

export function normalizeCalendarSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ca')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isCalendarSearchActive(query: string): boolean {
  return normalizeCalendarSearch(query).length >= CALENDAR_SEARCH_MIN_LENGTH
}

export function matchesCalendarSearch(
  deal: CalendarSearchableDeal,
  query: string
): boolean {
  const normalizedQuery = normalizeCalendarSearch(query)
  if (normalizedQuery.length < CALENDAR_SEARCH_MIN_LENGTH) return true

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const statusTerms =
    deal.codeStatus === 'confirmed'
      ? 'confirmat confirmats codi correcte'
      : deal.codeStatus === 'review'
        ? 'revisio revisar codi'
        : deal.codeStatus === 'missing'
          ? 'sense codi'
          : ''

  const haystack = normalizeCalendarSearch([
    deal.id,
    deal.NomEvent,
    deal.Comercial,
    deal.ComercialIntern,
    deal.Responsable,
    deal.LN,
    deal.Servei,
    deal.StageGroup,
    deal.DataInici,
    deal.DataFi,
    deal.Ubicacio,
    deal.HoraInici,
    deal.HoraFi,
    deal.NumPax,
    deal.ObservacionsZoho,
    deal.code,
    statusTerms,
    deal.cancelled ? 'cancel lat cancellat cancelat' : '',
    deal.origen,
  ].join(' '))

  return tokens.every((token) => haystack.includes(token))
}

export function filterCalendarDealsBySearch<T extends CalendarSearchableDeal>(
  deals: T[],
  query: string
): T[] {
  if (!isCalendarSearchActive(query)) return deals
  return deals.filter((deal) => matchesCalendarSearch(deal, query))
}

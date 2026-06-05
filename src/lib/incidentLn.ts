export const INCIDENTS_LN_OPTIONS = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'casaments', label: 'Casaments' },
  { key: 'grups restaurants', label: 'Grups Restaurants' },
  { key: 'foodlovers', label: 'Foodlovers' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'altres', label: 'Altres' },
] as const

export function normalizeIncidentLn(ln?: string | null): string {
  const n = (ln || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  if (!n) return 'altres'
  if (n === 'restaurants' || n === 'restauracio') return 'grups restaurants'
  return n
}

export function incidentMatchesLnFilter(
  incidentLn: string | null | undefined,
  filterLn: string | null | undefined
): boolean {
  const selected = String(filterLn || 'all').trim()
  if (!selected || selected === 'all') return true
  return normalizeIncidentLn(incidentLn) === normalizeIncidentLn(selected)
}

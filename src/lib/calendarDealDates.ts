import { parseISO } from 'date-fns'
import type { Deal } from '@/hooks/useCalendarData'

const pickIso = (deal: Deal, keys: string[]) => {
  const row = deal as Deal & Record<string, unknown>
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10)
  }
  return ''
}

export function dealOverlapsDay(deal: Deal, dayIso: string): boolean {
  const startIso = pickIso(deal, ['DataInici', 'Data'])
  if (!startIso) return false
  const endIso = pickIso(deal, ['DataFi', 'DataInici', 'Data']) || startIso

  const day = parseISO(dayIso)
  const start = parseISO(startIso)
  const end = parseISO(endIso)
  if (Number.isNaN(day.getTime()) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false
  }
  return start <= day && end >= day
}

export function dealsForDay(deals: Deal[], dayIso: string): Deal[] {
  return deals
    .filter((deal) => dealOverlapsDay(deal, dayIso))
    .sort((a, b) => {
      const ha = a.HoraInici || ''
      const hb = b.HoraInici || ''
      if (ha !== hb) return ha.localeCompare(hb)
      return (a.NomEvent || '').localeCompare(b.NomEvent || '', 'ca')
    })
}

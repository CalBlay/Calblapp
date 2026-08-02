import { endOfWeek, format, startOfWeek } from 'date-fns'
import type { SmartFiltersChange } from '@/components/filters/SmartFilters'

export type PreparationFilterMode = NonNullable<SmartFiltersChange['mode']>

const FILTER_MODES = new Set<PreparationFilterMode>(['week', 'month', 'year', 'day', 'range'])

export function buildDefaultWeekRange() {
  const now = new Date()
  const monday = startOfWeek(now, { weekStartsOn: 1 })
  const sunday = endOfWeek(now, { weekStartsOn: 1 })
  return {
    start: format(monday, 'yyyy-MM-dd'),
    end: format(sunday, 'yyyy-MM-dd'),
  }
}

export function buildTodayRange() {
  const today = format(new Date(), 'yyyy-MM-dd')
  return { start: today, end: today }
}

export function parseFilterMode(value?: string | null): PreparationFilterMode {
  const mode = String(value || '').trim() as PreparationFilterMode
  return FILTER_MODES.has(mode) ? mode : 'week'
}

export function parseDateRangeFromSearch(
  searchParams: URLSearchParams,
  fallback: { start: string; end: string }
) {
  const start = searchParams.get('start')?.trim() || ''
  const end = searchParams.get('end')?.trim() || ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { start, end }
  }
  return fallback
}

export function buildDashboardHref(
  dateRange: { start: string; end: string } | null,
  mode: PreparationFilterMode
) {
  const params = new URLSearchParams()
  if (dateRange?.start) params.set('start', dateRange.start)
  if (dateRange?.end) params.set('end', dateRange.end)
  params.set('mode', mode)
  return `/menu/logistica/preparacio/dashboard?${params.toString()}`
}

export function parseRoleForPreparationFilters(
  role: string
): 'Admin' | 'Direcció' | 'Cap Departament' | 'Treballador' {
  if (role === 'admin') return 'Admin'
  if (role === 'direccio') return 'Direcció'
  if (role === 'cap') return 'Cap Departament'
  return 'Treballador'
}

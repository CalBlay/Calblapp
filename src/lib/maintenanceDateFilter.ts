import { endOfDay, format, parseISO, startOfDay } from 'date-fns'

export type MaintenanceDateFilterMode = 'all' | 'planned'

export const MAINTENANCE_DATE_MODE_LABELS: Record<MaintenanceDateFilterMode, string> = {
  all: 'No aplicar filtre de dates',
  planned: 'Filtre de dates actiu',
}

export function getCurrentMaintenanceWeekRange() {
  const now = new Date()
  const start = new Date(now)
  const day = start.getDay() || 7
  if (day !== 1) start.setDate(start.getDate() - (day - 1))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') }
}

export function parseMaintenanceFilterDate(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return null
  const date = typeof value === 'number' ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatMaintenanceDateRangeLabel(start: string, end: string) {
  return start === end ? start : `${start} - ${end}`
}

export function getMaintenanceDateRangeMs(start: string, end: string) {
  return {
    startMs: startOfDay(parseISO(start)).getTime(),
    endMs: endOfDay(parseISO(end)).getTime(),
  }
}

function matchesMaintenanceDateRange(params: {
  mode: MaintenanceDateFilterMode
  start: string
  end: string
  dateValue?: number | string | null
}) {
  if (params.mode === 'all') return true
  const date = parseMaintenanceFilterDate(params.dateValue)
  if (!date) return false
  const { startMs, endMs } = getMaintenanceDateRangeMs(params.start, params.end)
  const ms = date.getTime()
  return ms >= startMs && ms <= endMs
}

/** Mateix criteri que Seguiment: data planificada dins del rang seleccionat. */
export function matchesMaintenancePlannedDateFilter(params: {
  mode: MaintenanceDateFilterMode
  start: string
  end: string
  plannedStart?: number | string | null
}) {
  return matchesMaintenanceDateRange({
    mode: params.mode,
    start: params.start,
    end: params.end,
    dateValue: params.plannedStart,
  })
}

/**
 * Tickets: planificats per data planificada; sense planificar per data de creació.
 */
export function matchesMaintenanceTicketDateFilter(params: {
  mode: MaintenanceDateFilterMode
  start: string
  end: string
  plannedStart?: number | string | null
  createdAt?: number | string | null
}) {
  return matchesMaintenanceDateRange({
    mode: params.mode,
    start: params.start,
    end: params.end,
    dateValue: params.plannedStart ?? params.createdAt,
  })
}

export function formatDaysUntilMin(d: number | null): string {
  if (d === null) return '—'
  if (d === 0) return 'Al mínim'
  if (!Number.isFinite(d)) return '—'
  return `${Math.ceil(d)} dies`
}

export type StockHealth = 'critical' | 'warning' | 'healthy'

export function getStockHealth(row: {
  atOrBelowMin: boolean
  daysUntilMin: number | null
}): StockHealth {
  if (row.atOrBelowMin) return 'critical'
  if (
    row.daysUntilMin !== null &&
    Number.isFinite(row.daysUntilMin) &&
    row.daysUntilMin > 0 &&
    row.daysUntilMin <= 30
  ) {
    return 'warning'
  }
  return 'healthy'
}

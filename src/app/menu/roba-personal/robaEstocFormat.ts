export function formatDaysUntilMin(d: number | null): string {
  if (d === null) return '—'
  if (d === 0) return 'Al mínim'
  if (!Number.isFinite(d)) return '—'
  return `${Math.ceil(d)} dies`
}

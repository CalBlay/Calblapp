/** Subcarpetes GCS/local alineades amb calblay-mcp-server/src/services/finances/paths.js */
export type FinanceKind = 'compres' | 'costos' | 'vendes' | 'rh'

export function financeKindSegment(kind: FinanceKind): string {
  if (kind === 'rh') return process.env.FINANCE_PATH_RH || 'RRHH'
  if (kind === 'costos') return process.env.FINANCE_PATH_COSTOS || 'c.explotacio'
  if (kind === 'vendes') return process.env.FINANCE_PATH_VENDES || 'vendes'
  return process.env.FINANCE_PATH_COMPRES || 'compres'
}

export function financeGcsBase(): string {
  return (
    String(process.env.GCS_FINANCE_BASE || 'finances')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '') || 'finances'
  )
}

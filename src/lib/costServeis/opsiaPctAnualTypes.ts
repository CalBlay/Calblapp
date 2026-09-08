/** Tipus client-safe: % anual Compres / Gestió (vista Gestió). */

export const SERVICE_COST_OPSIA_PCT_ANUAL_COL = 'serviceCostOpsiaPctAnual'

export type OpsiaPctAnualTotals = {
  ingressos: number
  compres: number
  gestio: number
  pctCompres: number | null
  pctGestio: number | null
}

export type OpsiaPctAnualLnRow = {
  lnCodi: string
  lnNom: string
  ingressos: number
  compres: number
  gestio: number
  pctCompres: number | null
  pctGestio: number | null
}

export type OpsiaPctAnualDoc = {
  year: number
  vista: 'gestio'
  grup: string
  general: OpsiaPctAnualTotals
  byLn: Record<string, OpsiaPctAnualLnRow>
  source: string
  syncedAt: string
  syncedBy?: string
}

export type OpsiaPctAnualApiResponse = {
  year: number
  vista: 'gestio'
  grup: string
  general: OpsiaPctAnualTotals
  lines: OpsiaPctAnualLnRow[]
}

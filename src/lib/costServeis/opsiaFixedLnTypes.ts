/** Tipus i constants client-safe (sense firebaseAdmin). */

export const SERVICE_COST_OPSIA_FIXED_LN_COL = 'serviceCostOpsiaFixedLnMonths'

export type OpsiaFixedLnRow = {
  lnCodi: string
  lnNom: string
  vista: 'sap'
  /** TOTAL COST SALARIAL (node 17), € positiu. */
  costSalarial: number
}

export type OpsiaFixedLnMonthDoc = {
  year: number
  month: number
  ym: string
  vista: 'sap'
  byLn: Record<string, OpsiaFixedLnRow>
  source: string
  syncedAt: string
  syncedBy?: string
}

export type OpsiaFixedLnApiResponse = {
  year: number
  month: number
  vista: 'sap'
  node?: number
  lines: OpsiaFixedLnRow[]
}

export type OpsiaFixedLnTableRow = {
  ym: string
  year: number
  month: number
  lnCodi: string
  lnNom: string
  costSalarial: number
  syncedAt?: string
}

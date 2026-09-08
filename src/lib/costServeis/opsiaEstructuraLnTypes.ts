/** Tipus client-safe: estructura Central neta (sense Logística/Cuina). */

export const SERVICE_COST_OPSIA_ESTRUCTURA_LN_COL = 'serviceCostOpsiaEstructuraLnMonths'

export type OpsiaEstructuraLnRow = {
  lnCodi: string
  lnNom: string
  vista: 'gestio'
  compresImputades: number
  personalImputat: number
  personalExclosLogisticaCuina: number
  personalImputatNet: number
  gestioImputada: number
  estructuraCentral: number
  /** Valor a usar a Cost de serveis (sense Logística/Cuina al personal). */
  estructuraNeta: number
  execucioEstat: 'CONFIRMAT' | 'LIVE_FALLBACK' | 'SENSE_DADES'
}

export type OpsiaEstructuraLnMonthDoc = {
  year: number
  month: number
  ym: string
  vista: 'gestio'
  execucioEstat: 'CONFIRMAT' | 'LIVE_FALLBACK' | 'SENSE_DADES'
  logisticaCuinaPersonal: number
  personalCentralSap: number
  ratioLogisticaCuina: number
  byLn: Record<string, OpsiaEstructuraLnRow>
  source: string
  syncedAt: string
  syncedBy?: string
}

export type OpsiaEstructuraLnApiResponse = {
  year: number
  month: number
  vista: 'gestio'
  execucioEstat: 'CONFIRMAT' | 'LIVE_FALLBACK' | 'SENSE_DADES'
  logisticaCuinaPersonal: number
  personalCentralSap: number
  ratioLogisticaCuina: number
  lines: OpsiaEstructuraLnRow[]
}

export type OpsiaEstructuraLnTableRow = {
  ym: string
  year: number
  month: number
  lnCodi: string
  lnNom: string
  estructuraNeta: number
  estructuraCentral: number
  personalImputatNet: number
  personalExclosLogisticaCuina: number
  gestioImputada: number
  compresImputades: number
  execucioEstat: string
  syncedAt?: string
}

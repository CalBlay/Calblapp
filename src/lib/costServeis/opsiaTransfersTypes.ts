export const SERVICE_COST_OPSIA_TRANSFERS_COL = 'serviceCostOpsiaTransferMonths'

export type OpsiaTransferSourceGroup = 'CUINA' | 'CATERING'
export type OpsiaTransferDestinationGroup =
  | 'EMPRESA'
  | 'CASAMENTS'
  | 'FOODLOVERS'
  | 'CATERING'
export type OpsiaTransfersStatus = 'CONFIRMAT' | 'BORRADOR' | 'SENSE_DADES'

export type OpsiaTransferLine = {
  id: string
  origenGrup: OpsiaTransferSourceGroup
  origenCentreCodi: string
  origenCentreNom: string
  origenDeptCodi: string | null
  origenDeptNom: string | null
  destiCentreCodi: string
  destiCentreNom: string
  destiDeptCodi: string | null
  destiDeptNom: string | null
  destiGrup: OpsiaTransferDestinationGroup
  destiLnCodi: string
  destiLnNom: string
  minuts: number
  hores: number
  tarifaHora: number
  importTotal: number
}

export type OpsiaTransferSummary = {
  origenGrup: OpsiaTransferSourceGroup
  origenDeptCodi: string | null
  origenDeptNom: string
  destiCentreCodi: string
  destiCentreNom: string
  destiDeptCodi: string | null
  destiDeptNom: string | null
  destiGrup: OpsiaTransferDestinationGroup
  destiLnCodi: string
  destiLnNom: string
  minuts: number
  hores: number
  importTotal: number
  moviments: number
}

export type OpsiaTransfersApiResponse = {
  year: number
  month: number
  estat: OpsiaTransfersStatus
  sourceExecutionId: string | null
  sourceConfirmedAt: string | null
  filters: {
    origenGrups: OpsiaTransferSourceGroup[]
    destiGrups: OpsiaTransferDestinationGroup[]
  }
  totals: {
    minuts: number
    hores: number
    importTotal: number
    moviments: number
  }
  summary: OpsiaTransferSummary[]
  lines: OpsiaTransferLine[]
}

export type OpsiaTransfersMonthDoc = OpsiaTransfersApiResponse & {
  ym: string
  source: 'opsia-finance-confirmed-personnel-transfers'
  syncedAt: string
  syncedBy?: string
}

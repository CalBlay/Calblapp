export type RrhhTopProduct = {
  productId: string
  label: string
  quantity: number
  /** % sobre el total d’unitats sol·licitades al període (concentració de demanda). */
  shareOfRequestedPct: number
}

export type RrhhTopDepartment = {
  department: string
  requestCount: number
  requestedUnits: number
  /** % sobre el total d’unitats sol·licitades al període. */
  shareOfRequestedPct: number
}

/** Metadades del tall (reproduïbilitat i auditoria als exports). */
/** Sèrie diària (dia natural UTC, consistent amb l’agregació del servidor). */
export type RrhhDailyActivityPoint = {
  day: string
  requestCount: number
  requestedUnits: number
  /** Referències de producte distintes amb demanda aquest dia. */
  distinctProductsRequested: number
}

export type RrhhDeptArticleMixRow = {
  department: string
  productId: string
  productLabel: string
  units: number
}

export type RrhhReportContext = {
  kind: 'rolling' | 'range'
  /** Finestra “últims N dies” des d’ara. */
  rollingDays?: number
  /** YYYY-MM-DD (finestra fixa, interpretació segons ms enviats des del client). */
  dateFrom?: string
  dateTo?: string
  department: string | null
  status: string | null
  statusLabel?: string | null
  productId: string | null
  productLabel?: string | null
}

export type RrhhRobaOverview = {
  periodDays: number
  totalRequests: number
  byStatus: Record<string, number>
  /** Unitats sol·licitades (línies originals o actuals) en sol·licituds creades al període. */
  requestedUnitsInPeriod: number
  /** Unitats lliurades (suma d’entregues vinculades) per aquestes mateixes sol·licituds. */
  deliveredUnitsLinked: number
  /** 0–100+ (pot superar 100 si hi ha correccions d’entrega); null si no hi ha unitats sol·licitades. */
  pctDeliveredVsRequested: number | null
  /** Sol·licituds del període amb almenys una unitat lliurada registrada. */
  requestsWithSomeDelivery: number
  /**
   * Sol·licituds actives del període sense cap entrega registrada (ni cancel·lades).
   * Indicador de backlog / pipeline per a RRHH.
   */
  requestsPendingNoDelivery: number
  /** Mitjana de dies des de la creació de la sol·licitud fins a la data de la primera entrega; només casos amb entrega. */
  avgDaysToFirstDelivery: number | null
  /** Entregues vinculades a aquestes sol·licituds amb incidència de recepció oberta (treballador). */
  deliveriesWithOpenDispute: number
  /** Sol·licituds cancel·lades en el període (per observar fricció / retenció de demanda). */
  cancelledRequestsInPeriod: number
  topProducts: RrhhTopProduct[]
  topDepartments: RrhhTopDepartment[]
  /** Tots els dies de la finestra (UTC); dies sense moviment amb zeros. */
  dailyActivity: RrhhDailyActivityPoint[]
  /** Top combinacions departament sol·licitant × article (unitats). */
  deptArticleMix: RrhhDeptArticleMixRow[]
  /** Màxim de sol·licituds recents llegides per calcular el període (control de cobertura). */
  datasetScanLimit: number
  dataSources: readonly ['app']
  /** Present quan es vol explicitar el tall (preset o informe a mida). */
  reportContext?: RrhhReportContext
}

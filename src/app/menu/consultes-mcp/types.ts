export type StageEventRow = {
  id?: string
  code?: string
  NomEvent?: string
  DataInici?: string
  DataFi?: string
  NumPax?: number
  Ubicacio?: string
  Comercial?: string
  LN?: string
}

/** Camps habituals de `stage_verd` a la fitxa per code (hi ha més claus al document). */
export type StageVerdEventByCode = {
  id?: string
  NomEvent?: string
  code?: string
  DataInici?: string
  DataFi?: string
  NumPax?: number
  Import?: unknown
  PreuMenu?: unknown
  Ubicacio?: string
  Comercial?: string
  Servei?: string
  LN?: string
  Stage?: string
  StageGroup?: string
  origen?: string
  DataPeticio?: string
  Code?: string
  C_digo?: string
  codi?: string
}

export type FullByCodePayload = {
  code: string
  matchCount: number
  alternateMatches: Array<{ id?: string; NomEvent?: string; DataInici?: string }>
  event: StageVerdEventByCode & Record<string, unknown>
  quadrants: Record<string, unknown>[]
  incidents: Record<string, unknown>[]
}

/** Error retornat pel proxy /api/mcp/* quan falla el MCP o la config. */
export type McpApiErr = {
  ok?: boolean
  error?: string
  hint?: string
  raw?: string
}

export type McpUiError = { message: string; hint?: string; raw?: string }

export type ChatReportTable = {
  title: string
  columns: string[]
  rows: string[][]
}

/** KPI comparatiu (p. ex. dos trimestres); valors ja formats per mostrar. */
export type ChatReportKpi = {
  id: string
  label: string
  periodALabel: string
  periodBLabel: string
  valueA: string
  valueB: string
  delta?: string
  deltaPct?: string
  format?: 'eur' | 'qty' | 'count' | 'text'
}

export type ChatReportChart = {
  type: 'bar' | 'line'
  title: string
  xKey: string
  series: { name: string; dataKey: string; color?: string }[]
  data: Record<string, string | number | null>[]
}

export type ChatReport = {
  tables: ChatReportTable[]
  chart: ChatReportChart | null
  highlights: string[]
  /** Targetes resum (import, volum, etc.); opcional per informes antics. */
  kpis?: ChatReportKpi[]
}

export type OpenChatAnswer = {
  text: string
  model?: string
  toolCallsUsed?: number
  cached?: boolean
  report?: ChatReport | null
}

export type FincaRankingRow = {
  fincaKey: string
  label: string
  importSum: number
  eventCount: number
}

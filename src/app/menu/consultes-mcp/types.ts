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

export type FullByCodePayload = {
  code: string
  matchCount: number
  alternateMatches: Array<{ id?: string; NomEvent?: string; DataInici?: string }>
  event: Record<string, unknown> & { id?: string }
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

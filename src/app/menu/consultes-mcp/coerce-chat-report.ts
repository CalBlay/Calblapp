import type { ChatReport, ChatReportChart, ChatReportKpi, ChatReportTable } from './types'

export function coerceChatReport(raw: unknown): ChatReport | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const tablesRaw = o.tables
  const tables: ChatReportTable[] = Array.isArray(tablesRaw)
    ? tablesRaw
        .filter((t) => t && typeof t === 'object')
        .map((t) => {
          const x = t as Record<string, unknown>
          return {
            title: String(x.title ?? 'Taula'),
            columns: Array.isArray(x.columns) ? x.columns.map((c) => String(c)) : [],
            rows: Array.isArray(x.rows)
              ? x.rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c)) : []))
              : [],
          }
        })
    : []
  let chart: ChatReportChart | null = null
  if (o.chart && typeof o.chart === 'object') {
    const c = o.chart as Record<string, unknown>
    const data = Array.isArray(c.data)
      ? (c.data.filter((row) => row && typeof row === 'object') as Record<
          string,
          string | number | null
        >[])
      : []
    if (data.length) {
      const seriesRaw = c.series
      const series = Array.isArray(seriesRaw)
        ? seriesRaw
            .filter((s) => s && typeof s === 'object')
            .map((s) => {
              const z = s as Record<string, unknown>
              return {
                name: String(z.name ?? ''),
                dataKey: String(z.dataKey ?? 'value'),
                color: typeof z.color === 'string' ? z.color : undefined,
              }
            })
        : [{ name: 'Valor', dataKey: 'value' }]
      chart = {
        type: c.type === 'line' ? 'line' : 'bar',
        title: String(c.title ?? ''),
        xKey: String(c.xKey ?? 'label'),
        series: series.length ? series : [{ name: 'Valor', dataKey: 'value' }],
        data,
      }
    }
  }
  const highlights = Array.isArray(o.highlights) ? o.highlights.map((h) => String(h)) : []
  const kpisRaw = o.kpis
  const kpis: ChatReportKpi[] = Array.isArray(kpisRaw)
    ? kpisRaw
        .filter((k) => k && typeof k === 'object')
        .map((k, i) => {
          const x = k as Record<string, unknown>
          const fmt = String(x.format ?? 'text').toLowerCase()
          const format =
            fmt === 'eur' || fmt === 'qty' || fmt === 'count' || fmt === 'text' ? fmt : 'text'
          return {
            id: String(x.id ?? `kpi_${i}`).slice(0, 64),
            label: String(x.label ?? '').slice(0, 140),
            periodALabel: String(x.periodALabel ?? '').slice(0, 36),
            periodBLabel: String(x.periodBLabel ?? '').slice(0, 36),
            valueA: String(x.valueA ?? '—').slice(0, 72),
            valueB: String(x.valueB ?? '—').slice(0, 72),
            delta:
              x.delta !== undefined && x.delta !== null ? String(x.delta).slice(0, 72) : undefined,
            deltaPct:
              x.deltaPct !== undefined && x.deltaPct !== null
                ? String(x.deltaPct).slice(0, 36)
                : undefined,
            format,
          }
        })
    : []
  if (!tables.length && !chart && !highlights.length && !kpis.length) return null
  return {
    tables,
    chart,
    highlights,
    ...(kpis.length ? { kpis } : {}),
  }
}

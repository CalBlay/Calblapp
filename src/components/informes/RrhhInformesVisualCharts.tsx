'use client'

import { useMemo } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { RrhhRobaOverview } from '@/lib/informes/rrhhOverview'
import { ROBA_REQUEST_STATUS_LABEL } from '@/app/menu/roba-personal/robaPersonalConstants'

const PALETTE = ['#059669', '#0d9488', '#2563eb', '#7c3aed', '#d97706', '#e11d48', '#64748b', '#475569']

function formatDayShort(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })
}

type Props = {
  data: RrhhRobaOverview
  chartMountReady: boolean
  chartKey: string
}

/**
 * Bloc de gràfics per a informes RRHH (KPIs i informe a mida): tendència diària, donut d’estats, barres departament×article.
 */
export function RrhhInformesVisualCharts({ data, chartMountReady, chartKey }: Props) {
  const dailyChart = useMemo(
    () =>
      data.dailyActivity.map((r) => ({
        ...r,
        label: formatDayShort(r.day),
      })),
    [data.dailyActivity]
  )

  const statusDonut = useMemo(
    () =>
      Object.entries(data.byStatus)
        .map(([k, v]) => ({ name: ROBA_REQUEST_STATUS_LABEL[k] || k, value: v }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value),
    [data.byStatus]
  )

  const deptArticleBars = useMemo(() => {
    return [...data.deptArticleMix]
      .sort((a, b) => a.units - b.units)
      .map((r) => ({
        ...r,
        mixLabel: `${r.department.length > 16 ? `${r.department.slice(0, 16)}…` : r.department} · ${
          r.productLabel.length > 42 ? `${r.productLabel.slice(0, 42)}…` : r.productLabel
        }`,
      }))
  }, [data.deptArticleMix])

  const mixChartHeight = Math.min(440, 56 + deptArticleBars.length * 28)

  if (data.totalRequests === 0) {
    return null
  }

  if (!chartMountReady) {
    return (
      <div
        className="min-h-[520px] animate-pulse rounded-xl border border-border bg-muted/25"
        aria-hidden
      />
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-2 mb-1">
          5. Vista visual
        </h3>
        <p className="text-[11px] text-muted-foreground mb-3">
          Sèrie diària (UTC), distribució d’estats i principals parells departament · article.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Activitat diària</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
            Unitats sol·licitades (àrea), sol·licituds creades (línia) i referències de producte distintes (línia
            puntejada).
          </p>
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={300} debounce={50}>
              <ComposedChart data={dailyChart} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <defs>
                  <linearGradient id={`unitsGrad-${chartKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#059669" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                  width={34}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="requestedUnits"
                  name="Unitats sol·lic."
                  stroke="#059669"
                  strokeWidth={2}
                  fill={`url(#unitsGrad-${chartKey})`}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="requestCount"
                  name="Sol·licituds"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="distinctProductsRequested"
                  name="Refs. producte"
                  stroke="#d97706"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/15 p-4 shadow-sm flex flex-col min-h-[320px]">
          <p className="text-sm font-medium">Distribució per estat</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Flux de sol·licituds al període</p>
          <div className="flex-1 min-h-[248px]">
            {statusDonut.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sense dades.</p>
            ) : (
              <ResponsiveContainer width="100%" height={248} debounce={50}>
                <PieChart>
                  <Pie
                    data={statusDonut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {statusDonut.map((_, i) => (
                      <Cell key={`${chartKey}-cell-${i}`} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="xl:col-span-3 rounded-xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm">
          <p className="text-sm font-medium">Departament × article</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
            Top {deptArticleBars.length} combinacions per unitats sol·licitades (el més alt a dalt).
          </p>
          {deptArticleBars.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6">Sense línies al període.</p>
          ) : (
            <div className="w-full min-w-0" style={{ height: mixChartHeight }}>
              <ResponsiveContainer width="100%" height={mixChartHeight} debounce={50}>
                <BarChart
                  layout="vertical"
                  data={deptArticleBars}
                  margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border) / 0.6)" />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="mixLabel"
                    width={220}
                    tick={{ fontSize: 9 }}
                    interval={0}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                      maxWidth: 320,
                    }}
                  />
                  <Bar dataKey="units" name="Unitats" radius={[0, 6, 6, 0]} barSize={14}>
                    {deptArticleBars.map((_, i) => (
                      <Cell key={`bar-${i}`} fill={PALETTE[(PALETTE.length - 1 - (i % PALETTE.length)) % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

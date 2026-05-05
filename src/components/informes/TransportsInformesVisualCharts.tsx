'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DonutChart } from '@/components/charts/DonutChart'
import type { TransportsOverview } from '@/lib/informes/transportsOverview'

const PALETTE = ['#059669', '#f59e0b', '#ef4444', '#94a3b8']

type Props = {
  data: TransportsOverview
  chartMountReady: boolean
}

export function TransportsInformesVisualCharts({ data, chartMountReady }: Props) {
  const donutReview = useMemo(
    () => data.reviewBuckets.map((bucket) => ({ name: bucket.label, value: bucket.value })),
    [data.reviewBuckets]
  )

  const donutItv = useMemo(
    () => data.itvBuckets.map((bucket) => ({ name: bucket.label, value: bucket.value })),
    [data.itvBuckets]
  )

  const topVehicles = useMemo(
    () =>
      data.topVehicles.map((row) => ({
        ...row,
        shortLabel: row.plate,
      })),
    [data.topVehicles]
  )

  if (!chartMountReady) {
    return <div className="min-h-[520px] animate-pulse rounded-xl border border-border bg-muted/25" />
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Vista visual
        </h3>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Evolucio mensual, estat de manteniment i intensitat d&apos;us del parc.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Quilometratge i assignacions per mes</p>
          <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
            Km mensuals calculats per diferencial d&apos;odometre i nombre d&apos;assignacions registrades.
          </p>
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={320} debounce={50}>
              <ComposedChart data={data.monthlySeries} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  allowDecimals={false}
                  width={48}
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
                <Bar
                  yAxisId="left"
                  dataKey="km"
                  name="Km mensuals"
                  radius={[6, 6, 0, 0]}
                  fill="#0f766e"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="assignments"
                  name="Assignacions"
                  stroke="#4f46e5"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/15 p-4 shadow-sm">
          <p className="text-sm font-medium">Top vehicles</p>
          <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
            Vehicles amb mes assignacions dins del periode.
          </p>
          <div className="h-[320px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={320} debounce={50}>
              <BarChart
                layout="vertical"
                data={topVehicles}
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border) / 0.6)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="shortLabel"
                  width={76}
                  tick={{ fontSize: 10 }}
                  interval={0}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="assignments" name="Assignacions" radius={[0, 6, 6, 0]} barSize={16}>
                  {topVehicles.map((_, index) => (
                    <Cell key={`vehicle-bar-${index}`} fill={PALETTE[index % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/15 p-4 shadow-sm">
          <p className="text-sm font-medium">Estat de revisio</p>
          <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
            Deteccio d&apos;al dia, propera, vencuda o sense dada.
          </p>
          <DonutChart data={donutReview} />
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-b from-card to-muted/15 p-4 shadow-sm">
          <p className="text-sm font-medium">Estat d&apos;ITV</p>
          <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
            Control de vigencia, properes caducitats i vehicles sense informar.
          </p>
          <DonutChart data={donutItv} />
        </div>

        <div className="xl:col-span-1 rounded-xl border border-border bg-gradient-to-b from-card to-muted/15 p-4 shadow-sm">
          <p className="text-sm font-medium">Conductors mes actius</p>
          <p className="mb-3 mt-0.5 text-[11px] text-muted-foreground">
            Pes operatiu per conductor al periode seleccionat.
          </p>
          <div className="space-y-2">
            {data.topDrivers.length ? (
              data.topDrivers.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">{row.vehicles} vehicles diferents</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {row.assignments}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-muted-foreground">Sense assignacions al periode.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

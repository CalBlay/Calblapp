'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DonutChart } from '@/components/charts/DonutChart'
import type { MaintenanceOverview } from '@/lib/informes/maintenanceOverview'

const PALETTE = ['#059669', '#0ea5e9', '#f59e0b', '#ef4444', '#94a3b8']

type Props = {
  data: MaintenanceOverview
  chartMountReady: boolean
}

function formatHours(minutes: number) {
  return `${(minutes / 60).toLocaleString('ca-ES', { maximumFractionDigits: 1 })} h`
}

export function MaintenanceInformesVisualCharts({ data, chartMountReady }: Props) {
  const donutStatus = useMemo(
    () => data.statusBuckets.map((bucket) => ({ name: bucket.label, value: bucket.value })),
    [data.statusBuckets]
  )

  const donutPriority = useMemo(
    () => data.priorityBuckets.map((bucket) => ({ name: bucket.label, value: bucket.value })),
    [data.priorityBuckets]
  )

  const monthlyHours = useMemo(
    () =>
      data.monthlySeries.map((row) => ({
        ...row,
        workHours: Math.round((row.workMinutes / 60) * 10) / 10,
        travelHours: Math.round((row.travelMinutes / 60) * 10) / 10,
        totalHours: Math.round((row.totalMinutes / 60) * 10) / 10,
      })),
    [data.monthlySeries]
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
          Volum de tickets i preventius, hores de treball i desplaçament (anada + tornada segons centres).
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Intervencions i hores per mes</p>
          <div className="h-[320px] w-full min-w-0 mt-3">
            <ResponsiveContainer width="100%" height={320} debounce={50}>
              <ComposedChart data={monthlyHours} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
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
                  width={44}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'tickets') return [value, 'Tickets']
                    if (name === 'preventius') return [value, 'Preventius']
                    return [`${value} h`, name === 'workHours' ? 'Treball' : name === 'travelHours' ? 'Desplaçament' : 'Total']
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="tickets" fill="#0ea5e9" name="Tickets" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="preventius" fill="#8b5cf6" name="Preventius" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="totalHours" stroke="#059669" strokeWidth={2} name="Hores totals" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Estat de les intervencions</p>
          <DonutChart data={donutStatus} colors={PALETTE} className="mt-4 h-[260px]" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Prioritat</p>
          <DonutChart data={donutPriority} colors={PALETTE} className="mt-4 h-[240px]" />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-foreground">Hores per ubicació (top)</p>
          <div className="h-[260px] w-full min-w-0 mt-3">
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <BarChart
                data={data.topLocations.slice(0, 8).map((row) => ({
                  name: row.location.length > 18 ? `${row.location.slice(0, 16)}…` : row.location,
                  totalHours: Math.round((row.totalMinutes / 60) * 10) / 10,
                }))}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.6)" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [formatHours(v * 60), 'Hores totals']} />
                <Bar dataKey="totalHours" fill="#059669" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useId, useMemo } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AuditOverview } from '@/lib/informes/auditOverview'

type Props = {
  data: AuditOverview
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Date(year, month - 1, day).toLocaleDateString('ca-ES', {
    day: 'numeric',
    month: 'short',
  })
}

export function AuditInformesVisualCharts({ data }: Props) {
  const gradientId = useId().replace(/:/g, '')
  const trend = useMemo(
    () => data.trend.map((row) => ({ ...row, label: formatDay(row.day) })),
    [data.trend]
  )
  const funnelMax = Math.max(1, ...data.funnel.map((step) => step.value))

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]">
      <section className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/20 p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Evolució de l’activitat i la qualitat</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Volum diari, compliment de les validades i qualitat d’emplenament.
        </p>
        {trend.length === 0 ? (
          <div className="flex h-[290px] items-center justify-center text-sm text-muted-foreground">
            Sense auditories en aquest període.
          </div>
        ) : (
          <div className="mt-3 h-[290px] min-w-0">
            <ResponsiveContainer width="100%" height={290} debounce={50}>
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.65)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  minTickGap={24}
                />
                <YAxis yAxisId="count" allowDecimals={false} width={34} tick={{ fontSize: 10 }} />
                <YAxis
                  yAxisId="pct"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  width={42}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 10,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    name === 'Compliment' || name === 'Emplenament' ? `${value ?? 0}%` : value,
                    name,
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Area
                  yAxisId="count"
                  type="monotone"
                  dataKey="finalized"
                  name="Finalitzades"
                  stroke="#4f46e5"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
                <Bar
                  yAxisId="count"
                  dataKey="validated"
                  name="Validades"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  barSize={12}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="avgCompliancePct"
                  name="Compliment"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  connectNulls
                  dot={false}
                />
                <Line
                  yAxisId="pct"
                  type="monotone"
                  dataKey="avgCompletionPct"
                  name="Emplenament"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  connectNulls
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Del control al seguiment</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Embut d’auditories del període seleccionat.
        </p>
        <ol className="mt-5 space-y-3">
          {data.funnel.map((step, index) => {
            const width = Math.max(18, (step.value / funnelMax) * 100)
            return (
              <li key={step.key} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">
                    {index + 1}. {step.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{step.value}</span>
                </div>
                <div className="h-7 overflow-hidden rounded-md bg-muted/60">
                  <div
                    className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-indigo-500 to-cyan-500 px-2 text-[10px] font-semibold text-white transition-[width]"
                    style={{ width: `${width}%` }}
                    aria-label={`${step.label}: ${step.value}`}
                  >
                    {Math.round((step.value / funnelMax) * 100)}%
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FincaRankingRow } from './types'

export default function FincaRankingBarChart({ data }: { data: FincaRankingRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          type="number"
          tickFormatter={(v) =>
            `${Number(v).toLocaleString('ca-ES', { maximumFractionDigits: 0 })} €`
          }
        />
        <YAxis
          type="category"
          dataKey="label"
          width={148}
          tick={{ fontSize: 11 }}
          interval={0}
        />
        <Tooltip
          formatter={(v: number) => [
            `${v.toLocaleString('ca-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`,
            'Import',
          ]}
          labelFormatter={(_, payload) => {
            const p = payload?.[0]?.payload as { eventCount?: number } | undefined
            return p?.eventCount != null ? `Esdeveniments: ${p.eventCount}` : ''
          }}
        />
        <Bar dataKey="importSum" name="Import" fill="#059669" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

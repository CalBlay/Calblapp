'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  data?: { name: string; value: number }[]
  colors?: string[]
  className?: string
}

const COLORS = ['#10B981', '#3B82F6', '#FBBF24', '#EF4444']

export function DonutChart({ data = [], colors, className }: Props) {
  const palette = colors?.length ? colors : COLORS
  return (
    <div className={className}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={3}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={palette[idx % palette.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
    </div>
  )
}

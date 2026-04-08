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

import { DonutChart } from '@/components/reports/DonutChart'
import { typography } from '@/lib/typography'

type NameValueDatum = { name: string; value: number }

type IncidentStats = {
  statusChart: NameValueDatum[]
  deptChart: NameValueDatum[]
  catChart: NameValueDatum[]
}

type ActionStats = {
  statusChart: NameValueDatum[]
  deptChart: NameValueDatum[]
}

type DaySeries = { name: string; value: number }[]

export type IncidentsQuadreChartsProps =
  | {
      mode: 'incidents'
      stats: IncidentStats
      daySeries: DaySeries
      deptHeight: number
      catHeight: number
    }
  | {
      mode: 'actions'
      actionStats: ActionStats
      actionDeptHeight: number
    }

export default function IncidentsQuadreCharts(props: IncidentsQuadreChartsProps) {
  if (props.mode === 'actions') {
    const { actionStats, actionDeptHeight } = props
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className={`${typography('sectionTitle')} mb-2`}>Accions per estat</h3>
          {actionStats.statusChart.length === 0 ? (
            <p className={typography('bodySm')}>Cap acció en aquest període.</p>
          ) : (
            <DonutChart data={actionStats.statusChart} />
          )}
        </section>
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className={`${typography('sectionTitle')} mb-2`}>Accions per departament (acció)</h3>
          {actionStats.deptChart.length === 0 ? (
            <p className={typography('bodySm')}>Sense dades.</p>
          ) : (
            <ResponsiveContainer width="100%" height={actionDeptHeight}>
              <BarChart
                layout="vertical"
                data={actionStats.deptChart}
                margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#7c3aed" name="Accions" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>
    )
  }

  const { stats, daySeries, deptHeight, catHeight } = props
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className={`${typography('sectionTitle')} mb-2`}>Distribució per estat</h2>
          {stats.statusChart.length === 0 ? (
            <p className={typography('bodySm')}>Sense dades en aquest període.</p>
          ) : (
            <DonutChart data={stats.statusChart} />
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className={`${typography('sectionTitle')} mb-2`}>Incidències per dia</h2>
          {daySeries.length === 0 ? (
            <p className={typography('bodySm')}>Període no vàlid o sense dades.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={36} />
                <Tooltip />
                <Bar dataKey="value" fill="#0ea5e9" name="Incidències" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className={`${typography('sectionTitle')} mb-2`}>Per departament</h2>
        {stats.deptChart.length === 0 ? (
          <p className={typography('bodySm')}>Sense dades.</p>
        ) : (
          <ResponsiveContainer width="100%" height={deptHeight}>
            <BarChart
              layout="vertical"
              data={stats.deptChart}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#64748b" name="Incidències" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className={`${typography('sectionTitle')} mb-2`}>Per tipologia (categoria)</h2>
        {stats.catChart.length === 0 ? (
          <p className={typography('bodySm')}>Sense dades.</p>
        ) : (
          <ResponsiveContainer width="100%" height={catHeight}>
            <BarChart
              layout="vertical"
              data={stats.catChart}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#a855f7" name="Incidències" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>
    </>
  )
}

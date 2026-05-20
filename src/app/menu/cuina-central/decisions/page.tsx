'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Gauge } from 'lucide-react'
import type { DailyDecisionReport } from '@/lib/cuina-central/ml/types'

export default function CuinaCentralDecisionsPage() {
  const [dateKey, setDateKey] = useState(() => new Date().toISOString().slice(0, 10))
  const [report, setReport] = useState<DailyDecisionReport | null>(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const loadReport = useCallback(async (rebuild = false) => {
    setLoading(true)
    setStatus('')
    try {
      const params = new URLSearchParams({ date: dateKey })
      if (rebuild) params.set('build', '1')
      const res = await fetch(`/api/cuina-central/daily-reports?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error')
      setReport(json.report as DailyDecisionReport)
      if (json.generated) setStatus('Informe generat automàticament')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [dateKey])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const rebuildMl = async () => {
    setStatus('Recalculant models ML…')
    const res = await fetch('/api/cuina-central/ml/rebuild', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) return setStatus(json?.error || 'Error ML')
    setStatus(`ML reconstruït: ${json.processed} registres processats`)
    await loadReport(true)
  }

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Decisions diàries"
        subtitle="Teòric vs realitat (ML continu). Informe per prendre decisions operatives cada dia."
        icon={<Gauge className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <label className="text-xs text-slate-500">Data</label>
          <Input type="date" className="h-8" value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => void loadReport(true)} disabled={loading}>
          Actualitzar informe
        </Button>
        <Button size="sm" variant="outline" onClick={() => void rebuildMl()}>
          Recalcular ML (tot l'històric)
        </Button>
      </div>

      {status ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{status}</p>
      ) : null}

      {loading && !report ? <p className="text-sm text-slate-500">Carregant…</p> : null}

      {report ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Registres del dia" value={String(report.logsCount)} />
            <Kpi
              label="Eficiència mitjana"
              value={
                report.avgEfficiencyRatio != null
                  ? `${Math.round(report.avgEfficiencyRatio * 100)}%`
                  : '—'
              }
            />
            <Kpi label="Minuts producció" value={String(report.totalMinutes)} />
            <Kpi label="Rebutjos" value={String(report.totalRejectedQty)} />
          </div>

          {report.alerts.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h2 className="mb-2 text-sm font-semibold text-amber-900">Alertes</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
                {report.alerts.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="mb-2 text-sm font-semibold text-emerald-900">Recomanacions</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-emerald-900">
              {report.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Teòric vs realitat per article·màquina
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Article</th>
                    <th className="px-3 py-2">Màquina</th>
                    <th className="px-3 py-2">Teòric /h</th>
                    <th className="px-3 py-2">Real /h</th>
                    <th className="px-3 py-2">Efic.</th>
                    <th className="px-3 py-2">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  {report.deviations.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2">{row.articleCode}</td>
                      <td className="px-3 py-2">{row.machineCode}</td>
                      <td className="px-3 py-2">{row.theoreticalQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">{row.actualQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">
                        {row.efficiencyRatio != null
                          ? `${Math.round(row.efficiencyRatio * 100)}%`
                          : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 ${
                          row.deltaPct != null && Math.abs(row.deltaPct) >= 15
                            ? 'font-medium text-red-600'
                            : ''
                        }`}
                      >
                        {row.deltaPct != null ? `${row.deltaPct > 0 ? '+' : ''}${row.deltaPct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

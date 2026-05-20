'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BarChart2 } from 'lucide-react'
import type { ArticleMachineMetrics } from '@/lib/cuina-central/types'
import type { ModelPairState } from '@/lib/cuina-central/ml/types'
import { loadXlsx } from '@/lib/loadXlsx'

type ReportPayload = {
  pairMetrics: ArticleMachineMetrics[]
  modelStates: ModelPairState[]
  byMachine: { machineName: string; logs: number; minutes: number; qty: number; rejected: number }[]
  byArticle: { articleName: string; logs: number; minutes: number; qty: number; rejected: number }[]
  byOperator: { operator: string; logs: number; minutes: number; qty: number }[]
  trend: { endedAt: string; articleCode: string; machineCode: string; minutesPerUnit: number | null }[]
  sampleSize: number
}

export default function CuinaCentralInformesPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState<ReportPayload | null>(null)
  const [tab, setTab] = useState<'pair' | 'ml' | 'machine' | 'article' | 'operator' | 'trend'>('pair')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      const res = await fetch(`/api/cuina-central/reports?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error informes')
      setData(json)
    } catch (e) {
      setData(null)
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const exportExcel = async () => {
    if (!data) return
    const XLSX = await loadXlsx()
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.pairMetrics), 'Article-Maquina')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byMachine), 'Maquines')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byArticle), 'Articles')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byOperator), 'Operaris')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.trend), 'Tendencia')
    XLSX.writeFile(wb, `cuina-central-informes-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const tabs = [
    { id: 'pair' as const, label: 'Eficiència article·màquina' },
    { id: 'ml' as const, label: 'Model ML (teòric vs predit)' },
    { id: 'machine' as const, label: 'Per màquina' },
    { id: 'article' as const, label: 'Per article' },
    { id: 'operator' as const, label: 'Per operari' },
    { id: 'trend' as const, label: 'Tendència' },
  ]

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Informes"
        subtitle="Mètriques apreses, eficiència real vs teòric i exportació professional."
        icon={<BarChart2 className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="text-xs text-slate-500">Des de</label>
          <Input type="date" className="h-8" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Fins</label>
          <Input type="date" className="h-8" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => void load()} disabled={loading}>
          Actualitzar
        </Button>
        <Button size="sm" variant="outline" onClick={() => void exportExcel()} disabled={!data}>
          Exportar Excel
        </Button>
        {data ? (
          <span className="text-xs text-slate-500">{data.sampleSize} registres analitzats</span>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            size="sm"
            variant={tab === t.id ? 'default' : 'outline'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {loading || !data ? (
        <p className="text-sm text-slate-500">{loading ? 'Carregant…' : 'Sense dades'}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              {tab === 'ml' ? (
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Mostres</th>
                  <th className="px-3 py-2">Teòric /h</th>
                  <th className="px-3 py-2">Predit /h</th>
                  <th className="px-3 py-2">Conf.</th>
                  <th className="px-3 py-2">Efic.</th>
                </tr>
              ) : null}
              {tab === 'pair' ? (
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Mostres</th>
                  <th className="px-3 py-2">Min/u</th>
                  <th className="px-3 py-2">Kg/h real</th>
                  <th className="px-3 py-2">Kg/h teòric</th>
                  <th className="px-3 py-2">Efic.</th>
                </tr>
              ) : null}
              {tab === 'machine' ? (
                <tr>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Registres</th>
                  <th className="px-3 py-2">Minuts</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Rebutjos</th>
                </tr>
              ) : null}
              {tab === 'article' ? (
                <tr>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Registres</th>
                  <th className="px-3 py-2">Minuts</th>
                  <th className="px-3 py-2">Qty</th>
                </tr>
              ) : null}
              {tab === 'operator' ? (
                <tr>
                  <th className="px-3 py-2">Operari</th>
                  <th className="px-3 py-2">Registres</th>
                  <th className="px-3 py-2">Minuts</th>
                  <th className="px-3 py-2">Qty</th>
                </tr>
              ) : null}
              {tab === 'trend' ? (
                <tr>
                  <th className="px-3 py-2">Fi</th>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Min/unitat</th>
                </tr>
              ) : null}
            </thead>
            <tbody>
              {tab === 'ml'
                ? (data.modelStates || []).map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{row.articleCode}</td>
                      <td className="px-3 py-2">{row.machineCode}</td>
                      <td className="px-3 py-2">{row.allTime.sampleCount}</td>
                      <td className="px-3 py-2">{row.theoreticalQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">{row.predictedQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">{row.confidence}</td>
                      <td className="px-3 py-2">
                        {row.efficiencyRatio != null
                          ? `${Math.round(row.efficiencyRatio * 100)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))
                : null}
              {tab === 'pair'
                ? data.pairMetrics.map((row) => (
                    <tr key={`${row.articleId}-${row.machineId}`} className="border-t">
                      <td className="px-3 py-2">{row.articleCode}</td>
                      <td className="px-3 py-2">{row.machineCode}</td>
                      <td className="px-3 py-2">{row.sampleCount}</td>
                      <td className="px-3 py-2">{row.medianMinutesPerUnit ?? '—'}</td>
                      <td className="px-3 py-2">{row.medianQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">{row.theoreticalQtyPerHour ?? '—'}</td>
                      <td className="px-3 py-2">
                        {row.efficiencyRatio != null ? `${Math.round(row.efficiencyRatio * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))
                : null}
              {tab === 'machine'
                ? data.byMachine.map((row) => (
                    <tr key={row.machineName} className="border-t">
                      <td className="px-3 py-2">{row.machineName}</td>
                      <td className="px-3 py-2">{row.logs}</td>
                      <td className="px-3 py-2">{row.minutes}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                      <td className="px-3 py-2">{row.rejected}</td>
                    </tr>
                  ))
                : null}
              {tab === 'article'
                ? data.byArticle.map((row) => (
                    <tr key={row.articleName} className="border-t">
                      <td className="px-3 py-2">{row.articleName}</td>
                      <td className="px-3 py-2">{row.logs}</td>
                      <td className="px-3 py-2">{row.minutes}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                    </tr>
                  ))
                : null}
              {tab === 'operator'
                ? data.byOperator.map((row) => (
                    <tr key={row.operator} className="border-t">
                      <td className="px-3 py-2">{row.operator}</td>
                      <td className="px-3 py-2">{row.logs}</td>
                      <td className="px-3 py-2">{row.minutes}</td>
                      <td className="px-3 py-2">{row.qty}</td>
                    </tr>
                  ))
                : null}
              {tab === 'trend'
                ? data.trend.slice(-80).map((row, i) => (
                    <tr key={`${row.endedAt}-${i}`} className="border-t">
                      <td className="px-3 py-2">{row.endedAt?.slice(0, 16)}</td>
                      <td className="px-3 py-2">{row.articleCode}</td>
                      <td className="px-3 py-2">{row.machineCode}</td>
                      <td className="px-3 py-2">{row.minutesPerUnit ?? '—'}</td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClipboardList } from 'lucide-react'
import type {
  CuinaCentralArticle,
  CuinaCentralMachine,
  CuinaCentralProductionLog,
  CuinaCentralShift,
} from '@/lib/cuina-central/types'

const emptyRow = () => ({
  articleId: '',
  machineId: '',
  shiftId: '',
  quantityProduced: '',
  quantityRejected: '0',
  startedAt: '',
  endedAt: '',
  operatorNames: '',
  notes: '',
})

export default function CuinaCentralProduccioPage() {
  const [articles, setArticles] = useState<CuinaCentralArticle[]>([])
  const [machines, setMachines] = useState<CuinaCentralMachine[]>([])
  const [shifts, setShifts] = useState<CuinaCentralShift[]>([])
  const [logs, setLogs] = useState<CuinaCentralProductionLog[]>([])
  const [draft, setDraft] = useState(emptyRow())
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, m, s, l] = await Promise.all([
        fetch('/api/cuina-central/articles').then((r) => r.json()),
        fetch('/api/cuina-central/machines').then((r) => r.json()),
        fetch('/api/cuina-central/shifts').then((r) => r.json()),
        fetch('/api/cuina-central/production-logs?limit=100').then((r) => r.json()),
      ])
      setArticles(a.articles || [])
      setMachines(m.machines || [])
      setShifts(s.shifts || [])
      setLogs(l.logs || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === draft.articleId),
    [articles, draft.articleId]
  )
  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === draft.machineId),
    [machines, draft.machineId]
  )
  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === draft.shiftId),
    [shifts, draft.shiftId]
  )

  const saveLog = async () => {
    if (!selectedArticle || !selectedMachine) {
      setStatus('Selecciona article i màquina')
      return
    }
    const res = await fetch('/api/cuina-central/production-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articleId: selectedArticle.id,
        articleCode: selectedArticle.code,
        articleName: selectedArticle.name,
        machineId: selectedMachine.id,
        machineCode: selectedMachine.code,
        machineName: selectedMachine.name,
        shiftId: selectedShift?.id || '',
        shiftName: selectedShift?.name || '',
        unit: selectedArticle.unit,
        quantityProduced: Number(draft.quantityProduced),
        quantityRejected: Number(draft.quantityRejected) || 0,
        startedAt: new Date(draft.startedAt).toISOString(),
        endedAt: new Date(draft.endedAt).toISOString(),
        operatorNames: draft.operatorNames,
        notes: draft.notes,
      }),
    })
    const json = await res.json()
    if (!res.ok) return setStatus(json?.error || 'Error desant registre')
    setDraft(emptyRow())
    const mlNote = json.ml?.confidence
      ? ` · Model ML actualitzat (confiança ${json.ml.confidence})`
      : json.mlWarning
        ? ` · ${json.mlWarning}`
        : ''
    setStatus(`Registre de producció desat${mlNote}`)
    await load()
  }

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Producció"
        subtitle="Registre de torn: quantitats, màquina, hora inici/fi (minuts). Rebutjos a part."
        icon={<ClipboardList className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      {status ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{status}</p>
      ) : null}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Nou registre (final de torn)</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={draft.articleId}
            onChange={(e) => setDraft((s) => ({ ...s, articleId: e.target.value }))}
          >
            <option value="">Article / base</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={draft.machineId}
            onChange={(e) => setDraft((s) => ({ ...s, machineId: e.target.value }))}
          >
            <option value="">Màquina</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 px-2 text-sm"
            value={draft.shiftId}
            onChange={(e) => setDraft((s) => ({ ...s, shiftId: e.target.value }))}
          >
            <option value="">Torn (opcional)</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}-{s.endTime})
              </option>
            ))}
          </select>
          <Input
            type="number"
            step="any"
            placeholder="Quantitat produïda"
            value={draft.quantityProduced}
            onChange={(e) => setDraft((s) => ({ ...s, quantityProduced: e.target.value }))}
          />
          <Input
            type="number"
            step="any"
            placeholder="Rebutjos"
            value={draft.quantityRejected}
            onChange={(e) => setDraft((s) => ({ ...s, quantityRejected: e.target.value }))}
          />
          <Input
            type="datetime-local"
            value={draft.startedAt}
            onChange={(e) => setDraft((s) => ({ ...s, startedAt: e.target.value }))}
          />
          <Input
            type="datetime-local"
            value={draft.endedAt}
            onChange={(e) => setDraft((s) => ({ ...s, endedAt: e.target.value }))}
          />
          <Input
            placeholder="Operaris (separats per coma)"
            value={draft.operatorNames}
            onChange={(e) => setDraft((s) => ({ ...s, operatorNames: e.target.value }))}
          />
          <Input
            placeholder="Notes"
            value={draft.notes}
            onChange={(e) => setDraft((s) => ({ ...s, notes: e.target.value }))}
          />
        </div>
        <div className="mt-3">
          <Button type="button" onClick={() => void saveLog()}>
            Desar registre
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Últims registres</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Carregant…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Fi</th>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Min</th>
                  <th className="px-3 py-2">Min/u</th>
                  <th className="px-3 py-2">Operaris</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{log.endedAt?.slice(0, 16)}</td>
                    <td className="px-3 py-2">{log.articleCode}</td>
                    <td className="px-3 py-2">{log.machineCode}</td>
                    <td className="px-3 py-2">
                      {log.quantityProduced} {log.unit}
                      {log.quantityRejected > 0 ? (
                        <span className="text-red-600"> (−{log.quantityRejected} reb.)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{log.durationMinutes}</td>
                    <td className="px-3 py-2">
                      {log.quantityProduced > 0
                        ? (log.durationMinutes / log.quantityProduced).toFixed(2)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">{log.operatorNames || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

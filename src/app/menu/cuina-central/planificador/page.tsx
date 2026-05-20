'use client'

import { useCallback, useEffect, useState } from 'react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarRange } from 'lucide-react'
import type {
  CuinaCentralArticle,
  CuinaCentralProductionPlan,
  CuinaCentralShift,
  PlanNeedLine,
} from '@/lib/cuina-central/types'

const DAY_LABELS: Record<string, string> = {
  mon: 'Dl',
  tue: 'Dt',
  wed: 'Dc',
  thu: 'Dj',
  fri: 'Dv',
  sat: 'Ds',
  sun: 'Dg',
}

export default function CuinaCentralPlanificadorPage() {
  const [articles, setArticles] = useState<CuinaCentralArticle[]>([])
  const [shifts, setShifts] = useState<CuinaCentralShift[]>([])
  const [plans, setPlans] = useState<CuinaCentralProductionPlan[]>([])
  const [planId, setPlanId] = useState('')
  const [weekStart, setWeekStart] = useState('')
  const [needs, setNeeds] = useState<PlanNeedLine[]>([])
  const [operatorCountByShift, setOperatorCountByShift] = useState<Record<string, number>>({})
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const activePlan = plans.find((p) => p.id === planId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, s, p] = await Promise.all([
        fetch('/api/cuina-central/articles').then((r) => r.json()),
        fetch('/api/cuina-central/shifts').then((r) => r.json()),
        fetch('/api/cuina-central/plans').then((r) => r.json()),
      ])
      setArticles(a.articles || [])
      setShifts(s.shifts || [])
      const list: CuinaCentralProductionPlan[] = p.plans || []
      setPlans(list)
      if (!planId && list[0]) setPlanId(list[0].id)
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!planId) return
    fetch(`/api/cuina-central/plans/${planId}`)
      .then((r) => r.json())
      .then((json) => {
        const plan = json.plan as CuinaCentralProductionPlan
        if (!plan) return
        setWeekStart(plan.weekStart)
        setNeeds(plan.needs || [])
        setOperatorCountByShift(plan.operatorCountByShift || {})
      })
  }, [planId])

  const createPlan = async () => {
    if (!weekStart) return setStatus('Indica la setmana (dilluns)')
    const res = await fetch('/api/cuina-central/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weekStart, operatorCountByShift, needs }),
    })
    const json = await res.json()
    if (!res.ok) return setStatus(json?.error || 'Error')
    setPlanId(json.id)
    setStatus('Pla creat')
    await load()
  }

  const savePlan = async () => {
    if (!planId) return
    await fetch(`/api/cuina-central/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ needs, operatorCountByShift, weekStart }),
    })
    setStatus('Pla desat')
  }

  const generatePlan = async () => {
    if (!planId) return
    const res = await fetch(`/api/cuina-central/plans/${planId}/generate`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) return setStatus(json?.error || 'Error generant')
    const plan = json.plan as CuinaCentralProductionPlan
    setPlans((rows) => rows.map((r) => (r.id === planId ? plan : r)))
    setStatus('Planificació generada')
    setNeeds(plan.needs)
    setOperatorCountByShift(plan.operatorCountByShift)
  }

  const addNeed = () => {
    const article = articles[0]
    if (!article) return
    setNeeds((rows) => [
      ...rows,
      {
        articleId: article.id,
        articleCode: article.code,
        articleName: article.name,
        quantity: 0,
        unit: article.unit,
      },
    ])
  }

  return (
    <div>
      <ModuleHeader
        title="Cuina central · Planificador"
        subtitle="Necessitats setmanals, operaris per torn i pla automàtic (minimitzar hores extra)."
        icon={<CalendarRange className="h-5 w-5 text-slate-700" aria-hidden />}
      />

      {status ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{status}</p>
      ) : null}

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-slate-500">Setmana (dilluns)</label>
            <Input type="date" className="h-8" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </div>
          <select
            className="h-8 rounded-md border border-slate-200 px-2 text-sm"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            <option value="">— Pla —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.weekStart} ({p.status})
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => void createPlan()}>
            Nou pla
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void savePlan()} disabled={!planId}>
            Desar
          </Button>
          <Button size="sm" onClick={() => void generatePlan()} disabled={!planId}>
            Generar planificació
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {shifts.map((shift) => (
            <div key={shift.id} className="rounded-lg border border-slate-100 p-2">
              <p className="text-xs font-medium text-slate-700">{shift.name}</p>
              <label className="text-xs text-slate-500">Operaris</label>
              <Input
                type="number"
                min={1}
                className="h-8"
                value={operatorCountByShift[shift.id] ?? 1}
                onChange={(e) =>
                  setOperatorCountByShift((m) => ({
                    ...m,
                    [shift.id]: Math.max(1, Number(e.target.value) || 1),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Necessitats de producció</h2>
          <Button size="sm" variant="outline" onClick={addNeed}>
            Afegir línia
          </Button>
        </div>
        <div className="space-y-2">
          {needs.map((need, idx) => (
            <div key={idx} className="flex flex-wrap gap-2">
              <select
                className="h-8 min-w-[12rem] rounded-md border border-slate-200 px-2 text-sm"
                value={need.articleId}
                onChange={(e) => {
                  const article = articles.find((a) => a.id === e.target.value)
                  if (!article) return
                  setNeeds((rows) =>
                    rows.map((r, i) =>
                      i === idx
                        ? {
                            ...r,
                            articleId: article.id,
                            articleCode: article.code,
                            articleName: article.name,
                            unit: article.unit,
                          }
                        : r
                    )
                  )
                }}
              >
                {articles.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                className="h-8 w-28"
                value={need.quantity}
                onChange={(e) =>
                  setNeeds((rows) =>
                    rows.map((r, i) =>
                      i === idx ? { ...r, quantity: Number(e.target.value) } : r
                    )
                  )
                }
              />
              <span className="self-center text-sm text-slate-500">{need.unit}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600"
                onClick={() => setNeeds((rows) => rows.filter((_, i) => i !== idx))}
              >
                Treure
              </Button>
            </div>
          ))}
        </div>
      </section>

      {activePlan ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-4 text-sm text-slate-600">
            <span>Estimació: {activePlan.totalEstimatedMinutes} min</span>
            <span>Capacitat: {activePlan.totalCapacityMinutes} min</span>
            <span className={activePlan.overtimeMinutes > 0 ? 'text-red-600 font-medium' : ''}>
              Extra: {activePlan.overtimeMinutes} min
            </span>
          </div>
          {activePlan.warnings?.length ? (
            <ul className="mb-3 list-disc pl-5 text-sm text-amber-800">
              {activePlan.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Torn</th>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Màquina</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Min</th>
                </tr>
              </thead>
              <tbody>
                {(activePlan.slots || []).map((slot, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{DAY_LABELS[slot.day] || slot.day}</td>
                    <td className="px-3 py-2">{slot.shiftName}</td>
                    <td className="px-3 py-2">{slot.articleCode}</td>
                    <td className="px-3 py-2">{slot.machineCode}</td>
                    <td className="px-3 py-2">
                      {slot.quantity} {slot.unit}
                    </td>
                    <td className="px-3 py-2">{slot.estimatedMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        !loading && <p className="text-sm text-slate-500">Crea un pla setmanal per començar.</p>
      )}
    </div>
  )
}

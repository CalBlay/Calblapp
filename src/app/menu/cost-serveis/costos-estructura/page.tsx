'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Button } from '@/components/ui/button'
import {
  canChooseCostDepartment,
  costDepartmentSelectOptions,
  resolveCostDepartmentFilter,
} from '@/lib/costServeis/access'
import {
  COST_SERVEIS_DEPT_LABELS,
  type CostServeisDepartment,
} from '@/lib/costServeis/types'
import type { OpsiaStructureRow } from '@/lib/costServeis/opsiaFinance'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const fmtEuro = (n: number, digits = 2) =>
  n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
  })

const POT_LABELS: Record<string, string> = {
  gestio: 'Gestió',
  preparacio: 'Preparació',
  rentat: 'Rentat',
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function yearMonthsInRange(fromYm: string, toYm: string): string[] {
  const out: string[] = []
  let [y, m] = fromYm.split('-').map(Number)
  const [ty, tm] = toYm.split('-').map(Number)
  if (!y || !m || !ty || !tm) return out
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function monthTitle(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleDateString('ca-ES', {
    month: 'long',
    year: 'numeric',
  })
}

export default function CostosEstructuraPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const userDept = session?.user?.department
  const canChoose = canChooseCostDepartment(role, userDept)

  const [year, setYear] = useState(() => new Date().getFullYear())
  const [syncYm, setSyncYm] = useState(currentYearMonth)
  const [deptFilter, setDeptFilter] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const effectiveDept = useMemo(
    () =>
      resolveCostDepartmentFilter({
        role,
        department: userDept,
        requested: deptFilter,
      }),
    [role, userDept, deptFilter]
  )

  const fromYm = `${year}-01`
  const toYm = `${year}-12`
  const deptOptions = costDepartmentSelectOptions(canChoose)

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/opsia/months?from=${fromYm}&to=${toYm}&dept=${effectiveDept}`,
    fetcher
  )

  const rows = (data?.rows || []) as OpsiaStructureRow[]
  const configured = Boolean(data?.configured)
  const showAllDepts = effectiveDept === 'all'

  const byDeptMonth = useMemo(() => {
    const map = new Map<string, OpsiaStructureRow[]>()
    for (const row of rows) {
      const key = `${row.calBlayDept}::${row.ym}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(row)
    }
    return map
  }, [rows])

  const sections = useMemo(() => {
    const depts: CostServeisDepartment[] = showAllDepts
      ? ['logistica', 'serveis', 'cuina']
      : [effectiveDept as CostServeisDepartment]
    const months = yearMonthsInRange(fromYm, toYm)
    return depts.map((dept) => ({
      dept,
      label: COST_SERVEIS_DEPT_LABELS[dept],
      months: months
        .map((ym) => {
          const key = `${dept}::${ym}`
          const monthRows = byDeptMonth.get(key) || []
          const total = monthRows.reduce((s, r) => s + (r.costPersonal || 0), 0)
          return { ym, rows: monthRows, total }
        })
        .filter((m) => m.rows.length > 0),
    }))
  }, [showAllDepts, effectiveDept, fromYm, toYm, byDeptMonth])

  const onSync = async () => {
    setSyncMsg(null)
    const [y, m] = syncYm.split('-').map(Number)
    if (!y || !m) {
      setSyncMsg('Mes invàlid')
      return
    }
    setSyncing(true)
    try {
      const res = await fetch(
        `/api/cost-serveis/opsia/sync?year=${y}&month=${m}`,
        { method: 'POST' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg(json.error || `Error ${res.status}`)
        return
      }
      setSyncMsg(`Sincronitzat ${syncYm}`)
      await mutate()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error de xarxa')
    } finally {
      setSyncing(false)
    }
  }

  const thClass =
    'whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
  const tdClass = 'whitespace-nowrap px-2.5 py-2 text-sm text-slate-800'

  return (
    <section className="w-full max-w-none space-y-6 pb-12">
      <ModuleHeader
        title="Costos estructura"
        subtitle="Cost salarial mensual importat d’OpsiaFinance (per departament). Base per ponderar i repartir més endavant."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[120px]">
            <label className={corporateFilterLabelClass}>Any</label>
            <input
              type="number"
              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || year)}
              min={2020}
              max={2100}
            />
          </div>
          <div className="min-w-[220px]">
            <label className={corporateFilterLabelClass}>Departament</label>
            {canChoose ? (
              <select
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                value={effectiveDept}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                {deptOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div
                className={cn(
                  corporateFilterFieldClass,
                  'mt-1 flex w-full items-center bg-slate-50 text-slate-700'
                )}
              >
                {COST_SERVEIS_DEPT_LABELS[effectiveDept as CostServeisDepartment]}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px]">
            <label className={corporateFilterLabelClass}>Mes a sincronitzar</label>
            <input
              type="month"
              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              value={syncYm}
              onChange={(e) => setSyncYm(e.target.value)}
            />
          </div>
          <Button onClick={onSync} disabled={syncing || !configured}>
            {syncing ? 'Sincronitzant…' : 'Sincronitzar Opsia (Logística + Cuina)'}
          </Button>
        </div>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Configura <code className="text-xs">OPSIA_FINANCE_BASE_URL</code> i{' '}
          <code className="text-xs">OPSIA_FINANCE_API_KEY</code> a l’entorn del servidor.
        </p>
      ) : null}
      {syncMsg ? (
        <p className="text-sm text-slate-600">{syncMsg}</p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => {
            const hasAny = section.months.some((m) => m.rows.length > 0)
            return (
              <div key={section.dept} className="space-y-3">
                <h2 className="text-lg font-semibold text-slate-900">{section.label}</h2>
                {!hasAny ? (
                  <p className="text-sm text-slate-500">
                    {section.dept === 'logistica'
                      ? 'Encara no hi ha dades. Sincronitza un mes des d’OpsiaFinance.'
                      : 'Importació d’aquest departament: properament.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className={thClass}>Mes</th>
                          <th className={thClass}>Departament</th>
                          <th className={thClass}>Codi</th>
                          <th className={thClass}>Pot (futur)</th>
                          <th className={cn(thClass, 'text-right')}>Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.months.map((block) =>
                          block.rows.length === 0 ? null : (
                            block.rows.map((row, idx) => (
                              <tr
                                key={`${row.ym}-${row.deptCodi}-${idx}`}
                                className="border-t border-slate-100 odd:bg-slate-50/40"
                              >
                                <td className={tdClass}>
                                  {idx === 0 ? monthTitle(row.ym) : ''}
                                </td>
                                <td className={tdClass}>{row.deptNom}</td>
                                <td className={cn(tdClass, 'font-mono text-xs text-slate-500')}>
                                  {row.deptCodi || '—'}
                                </td>
                                <td className={tdClass}>
                                  {row.pot ? POT_LABELS[row.pot] || row.pot : '—'}
                                </td>
                                <td className={cn(tdClass, 'text-right font-medium')}>
                                  {fmtEuro(row.costPersonal)}
                                </td>
                              </tr>
                            ))
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

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
import type { OpsiaFixedLnTableRow } from '@/lib/costServeis/opsiaFixedLnTypes'
import type { OpsiaEstructuraLnTableRow } from '@/lib/costServeis/opsiaEstructuraLnTypes'
import type {
  OpsiaPctAnualDoc,
  OpsiaPctAnualLnRow,
} from '@/lib/costServeis/opsiaPctAnualTypes'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const POT_LABELS: Record<string, string> = {
  gestio: 'Gestió',
  preparacio: 'Preparació',
  rentat: 'Rentat',
}

type TabId = 'estructura' | 'fixos-ln' | 'estructura-ln' | 'pct-anual'

type OpsiaEstructuraMonthMeta = {
  ym: string
  execucioEstat?: string
  logisticaCuinaPersonal?: number
  personalCentralSap?: number
  ratioLogisticaCuina?: number
}

const EMPTY_STRUCTURE_ROWS: OpsiaStructureRow[] = []
const EMPTY_FIXED_LN_ROWS: OpsiaFixedLnTableRow[] = []
const EMPTY_ESTRUCTURA_LN_ROWS: OpsiaEstructuraLnTableRow[] = []
const EMPTY_ESTRUCTURA_MONTHS: OpsiaEstructuraMonthMeta[] = []

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

const fmtEuro = (n: number, digits = 2) =>
  n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: digits,
  })

const thClass =
  'whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600'
const tdClass = 'whitespace-nowrap px-2.5 py-2 text-sm text-slate-800'

export default function CostosEstructuraPage() {
  const [tab, setTab] = useState<TabId>('estructura')

  return (
    <section className="w-full max-w-none space-y-6 pb-12">
      <ModuleHeader
        title="Costos estructura"
        subtitle="Importació OpsiaFinance: pots, salarial, personal indirecte i % anual Compres/Gestió."
      />

      <div className="flex gap-1 border-b border-slate-200">
        {(
          [
            { id: 'estructura' as const, label: 'Estructura (Logística / Cuina)' },
            { id: 'fixos-ln' as const, label: 'Cost salarial LN' },
            { id: 'estructura-ln' as const, label: 'Personal indirecte LN' },
            { id: 'pct-anual' as const, label: '% anual Compres / Gestió' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-cyan-600 text-cyan-800'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'estructura' ? (
        <EstructuraTab />
      ) : tab === 'fixos-ln' ? (
        <FixosLnTab />
      ) : tab === 'estructura-ln' ? (
        <EstructuraLnTab />
      ) : (
        <PctAnualTab />
      )}
    </section>
  )
}

function EstructuraTab() {
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

  const rows = (data?.rows as OpsiaStructureRow[] | undefined) ?? EMPTY_STRUCTURE_ROWS
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

  return (
    <div className="space-y-6">
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
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}

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
                    {section.dept === 'logistica' || section.dept === 'cuina'
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
                          block.rows.length === 0
                            ? null
                            : block.rows.map((row, idx) => (
                                <tr
                                  key={`${row.ym}-${row.deptCodi}-${idx}`}
                                  className="border-t border-slate-100 odd:bg-slate-50/40"
                                >
                                  <td className={tdClass}>
                                    {idx === 0 ? monthTitle(row.ym) : ''}
                                  </td>
                                  <td className={tdClass}>{row.deptNom}</td>
                                  <td
                                    className={cn(
                                      tdClass,
                                      'font-mono text-xs text-slate-500'
                                    )}
                                  >
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
    </div>
  )
}

function FixosLnTab() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [syncYm, setSyncYm] = useState(currentYearMonth)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const fromYm = `${year}-01`
  const toYm = `${year}-12`

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/opsia/fixos-ln/months?from=${fromYm}&to=${toYm}`,
    fetcher
  )

  const rows =
    (data?.rows as OpsiaFixedLnTableRow[] | undefined) ?? EMPTY_FIXED_LN_ROWS
  const configured = Boolean(data?.configured)

  const byMonth = useMemo(() => {
    const map = new Map<string, OpsiaFixedLnTableRow[]>()
    for (const row of rows) {
      if (!map.has(row.ym)) map.set(row.ym, [])
      map.get(row.ym)!.push(row)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

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
        `/api/cost-serveis/opsia/fixos-ln/sync?year=${y}&month=${m}`,
        { method: 'POST' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg(json.error || `Error ${res.status}`)
        return
      }
      const n = Object.keys(json.month?.byLn || {}).length
      setSyncMsg(`Sincronitzat ${syncYm} · ${n} LN · cost salarial (SAP)`)
      await mutate()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error de xarxa')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Importa el <strong>TOTAL COST SALARIAL</strong> (node 17 / KPI Personal) del compte
        d’explotació vista <strong>SAP</strong> — mateixa font que RESULTATS → Per línia
        (vista SAP) — per <strong>totes les LN</strong> del mes seleccionat.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
            {syncing ? 'Sincronitzant…' : 'Sincronitzar cost salarial LN'}
          </Button>
        </div>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Configura <code className="text-xs">OPSIA_FINANCE_BASE_URL</code> i{' '}
          <code className="text-xs">OPSIA_FINANCE_API_KEY</code> a l’entorn del servidor.
          Cal desplegar també l’endpoint Opsia{' '}
          <code className="text-xs">/api/external/cost-fixos-ln</code>.
        </p>
      ) : null}
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : byMonth.length === 0 ? (
        <p className="text-sm text-slate-500">
          Encara no hi ha dades. Sincronitza un mes des d’OpsiaFinance.
        </p>
      ) : (
        <div className="space-y-6">
          {byMonth.map(([ym, monthRows]) => {
            const total = monthRows.reduce((s, r) => s + (r.costSalarial || 0), 0)
            return (
              <div key={ym} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {monthTitle(ym)}
                  </h2>
                  <span className="text-sm text-slate-600">
                    Total: <strong>{fmtEuro(total)}</strong>
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className={thClass}>LN</th>
                        <th className={thClass}>Codi</th>
                        <th className={thClass}>Mètode</th>
                        <th className={cn(thClass, 'text-right')}>Cost salarial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((row) => (
                        <tr
                          key={`${row.ym}-${row.lnCodi}`}
                          className="border-t border-slate-100 odd:bg-slate-50/40"
                        >
                          <td className={tdClass}>{row.lnNom}</td>
                          <td
                            className={cn(tdClass, 'font-mono text-xs text-slate-500')}
                          >
                            {row.lnCodi}
                          </td>
                          <td className={cn(tdClass, 'text-right font-medium')}>
                            {fmtEuro(row.costSalarial)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EstructuraLnTab() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [syncYm, setSyncYm] = useState(currentYearMonth)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const fromYm = `${year}-01`
  const toYm = `${year}-12`

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/opsia/estructura-ln/months?from=${fromYm}&to=${toYm}`,
    fetcher
  )

  const rows =
    (data?.rows as OpsiaEstructuraLnTableRow[] | undefined) ??
    EMPTY_ESTRUCTURA_LN_ROWS
  const months =
    (data?.months as OpsiaEstructuraMonthMeta[] | undefined) ??
    EMPTY_ESTRUCTURA_MONTHS
  const configured = Boolean(data?.configured)

  const metaByYm = useMemo(() => {
    const map = new Map<string, (typeof months)[number]>()
    for (const m of months) map.set(m.ym, m)
    return map
  }, [months])

  const byMonth = useMemo(() => {
    const map = new Map<string, OpsiaEstructuraLnTableRow[]>()
    for (const row of rows) {
      if (!map.has(row.ym)) map.set(row.ym, [])
      map.get(row.ym)!.push(row)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

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
        `/api/cost-serveis/opsia/estructura-ln/sync?year=${y}&month=${m}`,
        { method: 'POST' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg(json.error || `Error ${res.status}`)
        return
      }
      const n = Object.keys(json.month?.byLn || {}).length
      const estat = json.month?.execucioEstat || ''
      const pendingTotals = Object.values(
        json.month?.byLn || {}
      ).filter(
        (rawRow) => {
          const row = rawRow as {
            personalTotalLn?: number | null
            personalIndirecteMode?: string
            personalIndirecteFixConfigurat?: number | null
          }
          return row.personalIndirecteMode === 'FIX_DEPARTAMENTS'
            ? row.personalIndirecteFixConfigurat == null
            : row.personalTotalLn == null
        }
      ).length
      setSyncMsg(
        pendingTotals > 0
          ? `Sincronitzat ${syncYm}, però Opsia encara no envia el total de personal de ${pendingTotals} LN; no es calcularà cap pot incorrecte.`
          : `Sincronitzat ${syncYm} · ${n} LN · personal indirecte net (${estat})`
      )
      await mutate()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error de xarxa')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        <strong>Cost fix indirecte de personal</strong> per LN: total de personal
        del compte d’Opsia menys el fix directe de la LN i menys el personal de
        Logística/Cuina ja inclòs al cost operatiu. Només el resultat es reparteix
        entre tots els esdeveniments de la LN. Quan Opsia té «Import fix total»,
        s’aplica directament aquell import mensual sense recalcular-lo.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
            {syncing ? 'Sincronitzant…' : 'Sincronitzar personal indirecte LN'}
          </Button>
        </div>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Configura <code className="text-xs">OPSIA_FINANCE_BASE_URL</code> i{' '}
          <code className="text-xs">OPSIA_FINANCE_API_KEY</code> o{' '}
          <code className="text-xs">OPSIA_EXTERNAL_API_KEY</code>. Cal desplegar{' '}
          <code className="text-xs">/api/external/cost-estructura-ln</code>.
        </p>
      ) : null}
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : byMonth.length === 0 ? (
        <p className="text-sm text-slate-500">
          Encara no hi ha dades. Sincronitza un mes (preferible amb repartiment
          CONFIRMAT a Opsia).
        </p>
      ) : (
        <div className="space-y-6">
          {byMonth.map(([ym, monthRows]) => {
            const meta = metaByYm.get(ym)
            const missingTotals = monthRows.filter(
              (row) => row.personalIndirecteCalculat == null
            ).length
            const totalNet = monthRows.reduce(
              (s, r) => s + (r.personalIndirecteCalculat || 0),
              0
            )
            const totalExclos = monthRows.reduce(
              (s, r) => s + (r.personalExclosLogisticaCuina || 0),
              0
            )
            return (
              <div key={ym} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {monthTitle(ym)}
                    {meta?.execucioEstat ? (
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        · {meta.execucioEstat}
                      </span>
                    ) : null}
                  </h2>
                  <span className="text-sm text-slate-600">
                    Total fix indirecte calculat:{' '}
                    <strong>
                      {missingTotals > 0
                        ? `Incomplet · ${missingTotals} LN pendents d'Opsia`
                        : fmtEuro(totalNet)}
                    </strong>
                    <span className="ml-2 text-slate-400">
                      (exclòs L+C per dept {fmtEuro(totalExclos)})
                    </span>
                  </span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className={thClass}>LN</th>
                        <th className={thClass}>Codi</th>
                        <th className={thClass}>Mètode</th>
                        <th className={cn(thClass, 'text-right')}>
                          Total personal Opsia
                        </th>
                        <th className={cn(thClass, 'text-right')}>
                          Fix configurat Opsia
                        </th>
                        <th className={cn(thClass, 'text-right')}>Fix directe</th>
                        <th className={cn(thClass, 'text-right')}>Exclòs L+C</th>
                        <th className={cn(thClass, 'text-right')}>Fix indirecte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map((row) => {
                        return (
                          <tr
                            key={`${row.ym}-${row.lnCodi}`}
                            className="border-t border-slate-100 odd:bg-slate-50/40"
                          >
                            <td className={tdClass}>{row.lnNom}</td>
                            <td
                              className={cn(
                                tdClass,
                                'font-mono text-xs text-slate-500'
                              )}
                            >
                              {row.lnCodi}
                            </td>
                            <td className={tdClass}>
                              {row.personalIndirecteMode === 'FIX_DEPARTAMENTS'
                                ? 'Fix mensual Opsia'
                                : 'Residual de la LN'}
                            </td>
                            <td className={cn(tdClass, 'text-right font-medium')}>
                              {row.personalTotalLn == null
                                ? "Pendent d'Opsia"
                                : fmtEuro(row.personalTotalLn)}
                            </td>
                            <td className={cn(tdClass, 'text-right text-slate-500')}>
                              {row.personalIndirecteFixConfigurat == null
                                ? '—'
                                : fmtEuro(row.personalIndirecteFixConfigurat)}
                            </td>
                            <td className={cn(tdClass, 'text-right text-slate-500')}>
                              {row.fixedDirecte == null
                                ? 'No importat'
                                : fmtEuro(row.fixedDirecte)}
                            </td>
                            <td className={cn(tdClass, 'text-right text-slate-500')}>
                              {fmtEuro(row.personalExclosLogisticaCuina)}
                            </td>
                            <td className={cn(tdClass, 'text-right text-slate-500')}>
                              {row.personalIndirecteCalculat == null
                                ? 'No calculat'
                                : fmtEuro(row.personalIndirecteCalculat)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toLocaleString('ca-ES', { maximumFractionDigits: 2 })} %`
}

function PctAnualTab() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR(
    `/api/cost-serveis/opsia/pct-anual?year=${year}&grup=calblay`,
    fetcher
  )

  const doc = (data?.year || null) as OpsiaPctAnualDoc | null
  const configured = Boolean(data?.configured)
  const lines = useMemo(() => {
    const byLn = doc?.byLn || {}
    return Object.values(byLn).sort((a, b) =>
      a.lnCodi.localeCompare(b.lnCodi)
    ) as OpsiaPctAnualLnRow[]
  }, [doc])

  const onSync = async () => {
    setSyncMsg(null)
    setSyncing(true)
    try {
      const res = await fetch(
        `/api/cost-serveis/opsia/pct-anual?year=${year}&grup=calblay`,
        { method: 'POST' }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncMsg(json.error || `Error ${res.status}`)
        return
      }
      const g = json.year?.general
      setSyncMsg(
        `Sincronitzat ${year} · food cost ${fmtPct(g?.pctCompres)} · gestió ${fmtPct(g?.pctGestio)}`
      )
      await mutate()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error de xarxa')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        <strong>% anual</strong> de Compres (food cost) i Gestió sobre ingressos —
        vista <strong>Gestió</strong> d’Opsia (Directe + traspassos + repartiment),
        acumulat de tot l’any. Es desa el % general i el detall per LN.
      </p>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
        <Button onClick={onSync} disabled={syncing || !configured}>
          {syncing ? 'Sincronitzant…' : 'Sincronitzar % anual Gestió'}
        </Button>
      </div>

      {!configured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Configura OpsiaFinance. Cal desplegar{' '}
          <code className="text-xs">/api/external/cost-pct-anual</code>.
        </p>
      ) : null}
      {syncMsg ? <p className="text-sm text-slate-600">{syncMsg}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : !doc ? (
        <p className="text-sm text-slate-500">
          Encara no hi ha dades. Sincronitza l’any des d’OpsiaFinance (vista Gestió).
        </p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                % food cost (general)
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {fmtPct(doc.general?.pctCompres)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                % gestió (general)
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {fmtPct(doc.general?.pctGestio)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Ingressos any
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {fmtEuro(doc.general?.ingressos || 0)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sync
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {doc.syncedAt
                  ? new Date(doc.syncedAt).toLocaleString('ca-ES')
                  : '—'}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={thClass}>LN</th>
                  <th className={thClass}>Codi</th>
                  <th className={cn(thClass, 'text-right')}>% Compres</th>
                  <th className={cn(thClass, 'text-right')}>% Gestió</th>
                  <th className={cn(thClass, 'text-right')}>Ingressos</th>
                  <th className={cn(thClass, 'text-right')}>Compres</th>
                  <th className={cn(thClass, 'text-right')}>Gestió</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((row) => (
                  <tr
                    key={row.lnCodi}
                    className="border-t border-slate-100 odd:bg-slate-50/40"
                  >
                    <td className={tdClass}>{row.lnNom}</td>
                    <td className={cn(tdClass, 'font-mono text-xs text-slate-500')}>
                      {row.lnCodi}
                    </td>
                    <td className={cn(tdClass, 'text-right font-medium')}>
                      {fmtPct(row.pctCompres)}
                    </td>
                    <td className={cn(tdClass, 'text-right font-medium')}>
                      {fmtPct(row.pctGestio)}
                    </td>
                    <td className={cn(tdClass, 'text-right')}>
                      {fmtEuro(row.ingressos)}
                    </td>
                    <td className={cn(tdClass, 'text-right text-slate-500')}>
                      {fmtEuro(row.compres)}
                    </td>
                    <td className={cn(tdClass, 'text-right text-slate-500')}>
                      {fmtEuro(row.gestio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

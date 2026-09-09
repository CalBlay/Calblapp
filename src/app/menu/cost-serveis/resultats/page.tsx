'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  corporateFilterFieldClass,
  corporateFilterLabelClass,
} from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'
import type {
  ResultatsGroupRow,
  ResultatsItemRow,
  ResultatsMetrics,
} from '@/lib/costServeis/resultatsAggregate'
import type {
  FixedCostAuditRow,
  FixedCostCoverage,
} from '@/lib/costServeis/resultatsFixedCosts'
import PeTab from '@/app/menu/cost-serveis/resultats/PeTab'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const EMPTY_RESULTATS_ITEMS: ResultatsItemRow[] = []
const EMPTY_RESULTATS_GROUPS: ResultatsGroupRow[] = []

type MainTab = 'analisi' | 'fixos' | 'pe'
type ViewMode = 'individual' | 'service' | 'location' | 'month'
type FixedBasis = 'monthly' | 'normalized'

type SortKey =
  | 'label'
  | 'eventDate'
  | 'eventCount'
  | 'numPax'
  | 'billing'
  | 'cost'
  | 'margin'
  | 'marginPct'
  | 'costPct'

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmtEuro = (n: number) =>
  n.toLocaleString('ca-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  })

const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`

const VIEW_OPTIONS: Array<{ id: ViewMode; label: string }> = [
  { id: 'service', label: 'Tipus de servei' },
  { id: 'individual', label: 'Individual' },
  { id: 'location', label: 'Ubicació' },
  { id: 'month', label: 'Mes' },
]

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function SortTh({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2 font-medium', className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-slate-800"
        onClick={() => onSort(sortKey)}
      >
        {label}
        {active === sortKey ? (
          <span className="text-[10px] text-cyan-700">{dir === 'asc' ? '↑' : '↓'}</span>
        ) : null}
      </button>
    </th>
  )
}

type FixedDisplayRow = ResultatsItemRow | ResultatsGroupRow

function isItemRow(row: FixedDisplayRow): row is ResultatsItemRow {
  return 'eventId' in row
}

function fixedValues(
  row: FixedDisplayRow,
  basis: FixedBasis
) {
  const direct =
    basis === 'monthly' ? row.fixedDirect : row.fixedDirectNormalized
  const indirect =
    basis === 'monthly' ? row.fixedIndirect : row.fixedIndirectNormalized
  const total =
    row.operationalCost +
    row.theoreticalPurchaseCost +
    row.theoreticalManagementCost +
    direct +
    indirect
  const margin = row.billing - total
  return {
    direct,
    indirect,
    total,
    margin,
    marginPct: row.billing > 0 ? margin / row.billing : null,
  }
}

function StatusLabel({
  status,
}: {
  status: FixedCostAuditRow['directStatus'] | FixedCostAuditRow['indirectStatus']
}) {
  const labels = {
    ok: 'Correcte',
    missing_month: 'Falta mes',
    missing_ln: 'Falta LN',
    missing_base: 'Falta total Opsia',
    no_driver: 'Sense base',
  }
  const ok = status === 'ok'
  return (
    <span className={cn('text-xs', ok ? 'text-emerald-700' : 'font-medium text-amber-700')}>
      {labels[status]}
    </span>
  )
}

function FixedCostsPanel({
  summary,
  items,
  groups,
  view,
  basis,
  audit,
  coverage,
  onBasis,
}: {
  summary: ResultatsMetrics
  items: ResultatsItemRow[]
  groups: ResultatsGroupRow[]
  view: ViewMode
  basis: FixedBasis
  audit: FixedCostAuditRow[]
  coverage: FixedCostCoverage | null
  onBasis: (basis: FixedBasis) => void
}) {
  const rows: FixedDisplayRow[] = view === 'individual' ? items : groups
  const totals = fixedValues(summary as FixedDisplayRow, basis)
  const directTotal =
    basis === 'monthly' ? summary.fixedDirect : summary.fixedDirectNormalized
  const indirectTotal =
    basis === 'monthly' ? summary.fixedIndirect : summary.fixedIndirectNormalized

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={basis === 'monthly' ? 'default' : 'outline'}
          onClick={() => onBasis('monthly')}
        >
          Real mensual
        </Button>
        <Button
          type="button"
          size="sm"
          variant={basis === 'normalized' ? 'default' : 'outline'}
          onClick={() => onBasis('normalized')}
        >
          Anual normalitzat
        </Button>
      </div>

      <p className="text-xs text-slate-500">
        Suma variable + compres teòriques + gestió teòrica + fix directe + fix
        indirecte. La gestió cobreix despeses d’estructura no salarials; el fix
        indirecte correspon al personal indirecte i, per tant, tots dos se sumen.
        {basis === 'normalized' && coverage
          ? ` Normalització: ${coverage.normalizedYears
              .map(
                (row) =>
                  `${row.year} (${row.directMonths} mesos directes / ${row.indirectMonths} indirectes)`
              )
              .join(', ')}.`
          : ''}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Cost variable" value={fmtEuro(summary.operationalCost)} />
        <KpiCard label="Compres teòriques" value={fmtEuro(summary.theoreticalPurchaseCost)} />
        <KpiCard label="Gestió teòrica" value={fmtEuro(summary.theoreticalManagementCost)} />
        <KpiCard label="Fix directe" value={fmtEuro(directTotal)} />
        <KpiCard label="Fix indirecte" value={fmtEuro(indirectTotal)} />
        <KpiCard label="Cost consolidat" value={fmtEuro(totals.total)} />
        <KpiCard label="Resultat consolidat" value={fmtEuro(totals.margin)} />
      </div>

      {coverage &&
      (coverage.monthsMissingDirect.length > 0 ||
        coverage.monthsMissingIndirect.length > 0 ||
        coverage.yearsMissingPercentages.length > 0) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dades incompletes.
          {coverage.monthsMissingDirect.length > 0
            ? ` Fix directe pendent: ${coverage.monthsMissingDirect.join(', ')}.`
            : ''}
          {coverage.monthsMissingIndirect.length > 0
            ? ` Fix indirecte pendent: ${coverage.monthsMissingIndirect.join(', ')}.`
            : ''}
          {coverage.yearsMissingPercentages.length > 0
            ? ` Percentatges pendents: ${coverage.yearsMissingPercentages.join(', ')}.`
            : ''}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[1280px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">{view === 'individual' ? 'Esdeveniment' : 'Agrupació'}</th>
              {view === 'individual' ? <th className="px-3 py-2">LN</th> : null}
              <th className="px-3 py-2 text-right">Facturació</th>
              <th className="px-3 py-2 text-right">Variable</th>
              <th className="px-3 py-2 text-right">Compres %</th>
              <th className="px-3 py-2 text-right">Gestió %</th>
              <th className="px-3 py-2 text-right">Fix directe</th>
              <th className="px-3 py-2 text-right">Fix indirecte</th>
              <th className="px-3 py-2 text-right">Cost consolidat</th>
              <th className="px-3 py-2 text-right">Resultat</th>
              <th className="px-3 py-2 text-right">% resultat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = fixedValues(row, basis)
              return (
                <tr
                  key={isItemRow(row) ? row.eventId : row.key}
                  className="border-t border-slate-100"
                >
                  <td className="px-3 py-2">
                    {isItemRow(row) ? (
                      <Link
                        href={`/menu/cost-serveis/edicio/${row.eventId}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {row.eventDate} · {row.eventName}
                      </Link>
                    ) : (
                      <span className="font-medium">{row.label}</span>
                    )}
                  </td>
                  {isItemRow(row) ? (
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {row.ln || 'Sense LN'}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.billing)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.operationalCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEuro(row.theoreticalPurchaseCost)}
                    <span className="ml-1 text-[10px] text-slate-400">{fmtPct(row.purchasePct)}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEuro(row.theoreticalManagementCost)}
                    <span className="ml-1 text-[10px] text-slate-400">{fmtPct(row.managementPct)}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(values.direct)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEuro(values.indirect)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtEuro(values.total)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtEuro(values.margin)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(values.marginPct)}</td>
                </tr>
              )
            })}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={view === 'individual' ? 11 : 10}
                  className="px-3 py-6 text-center text-slate-500"
                >
                  Cap esdeveniment en aquest període.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Auditoria del repartiment mensual
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Mes</th>
                <th className="px-3 py-2">LN</th>
                <th className="px-3 py-2 text-right">Events</th>
                <th className="px-3 py-2 text-right">Facturació LN</th>
                <th className="px-3 py-2 text-right">Pot directe</th>
                <th className="px-3 py-2 text-right">Directe repartit</th>
                <th className="px-3 py-2">Estat directe</th>
                <th className="px-3 py-2">Mètode indirecte</th>
                <th className="px-3 py-2 text-right">Personal total Opsia</th>
                <th className="px-3 py-2 text-right">Fix configurat Opsia</th>
                <th className="px-3 py-2 text-right">L+C operatiu</th>
                <th className="px-3 py-2 text-right">Pot indirecte</th>
                <th className="px-3 py-2 text-right">Indirecte repartit</th>
                <th className="px-3 py-2">Estat indirecte</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.key} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.ym}</td>
                  <td className="px-3 py-2">{row.ln}</td>
                  <td className="px-3 py-2 text-right">{row.eventCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.billing)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.fixedDirectPool)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.fixedDirectAllocated)}</td>
                  <td className="px-3 py-2"><StatusLabel status={row.directStatus} /></td>
                  <td className="px-3 py-2">
                    {row.fixedIndirectMode === 'FIX_DEPARTAMENTS'
                      ? 'Fix mensual Opsia'
                      : 'Residual LN'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.personalTotalLn == null ? '—' : fmtEuro(row.personalTotalLn)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.fixedIndirectConfigured == null
                      ? '—'
                      : fmtEuro(row.fixedIndirectConfigured)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtEuro(row.fixedIndirectExcludedOperational)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.fixedIndirectPool)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEuro(row.fixedIndirectAllocated)}</td>
                  <td className="px-3 py-2"><StatusLabel status={row.indirectStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

export default function CostServeisResultatsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('analisi')
  const [ym, setYm] = useState(currentYearMonth())
  const [fromCustom, setFromCustom] = useState('')
  const [toCustom, setToCustom] = useState('')
  const [peYear, setPeYear] = useState(() => new Date().getFullYear())
  const [view, setView] = useState<ViewMode>('service')
  const [fixedBasis, setFixedBasis] = useState<FixedBasis>('monthly')
  const [sortKey, setSortKey] = useState<SortKey>('marginPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { from, to } = useMemo(() => {
    if (fromCustom && toCustom && fromCustom <= toCustom) {
      return { from: fromCustom, to: toCustom }
    }
    return monthRange(ym)
  }, [ym, fromCustom, toCustom])

  const { data, isLoading, error } = useSWR(
    mainTab !== 'pe'
      ? `/api/cost-serveis/resultats?from=${from}&to=${to}`
      : null,
    fetcher
  )

  const summary = (data?.summary || null) as ResultatsMetrics | null
  const items = (data?.items as ResultatsItemRow[] | undefined) ?? EMPTY_RESULTATS_ITEMS
  const byServiceType =
    (data?.byServiceType as ResultatsGroupRow[] | undefined) ?? EMPTY_RESULTATS_GROUPS
  const byLocation =
    (data?.byLocation as ResultatsGroupRow[] | undefined) ?? EMPTY_RESULTATS_GROUPS
  const byMonth =
    (data?.byMonth as ResultatsGroupRow[] | undefined) ?? EMPTY_RESULTATS_GROUPS
  const fixedCostAudit =
    (data?.fixedCostAudit as FixedCostAuditRow[] | undefined) ?? []
  const fixedCostCoverage =
    (data?.fixedCostCoverage as FixedCostCoverage | undefined) ?? null

  const onSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'label' || k === 'eventDate' ? 'asc' : 'desc')
    }
  }

  const sortedGroups = useMemo(() => {
    const source =
      view === 'service'
        ? byServiceType
        : view === 'location'
          ? byLocation
          : view === 'month'
            ? byMonth
            : []
    const rows = [...source]
    const mul = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === 'label') return mul * a.label.localeCompare(b.label, 'ca')
      const metric = (row: ResultatsGroupRow) => {
        if (sortKey === 'cost') return row.operationalCost
        if (sortKey === 'margin') return row.contributionMargin
        if (sortKey === 'marginPct') {
          return row.billing > 0 ? row.contributionMargin / row.billing : null
        }
        if (sortKey === 'costPct') {
          return row.billing > 0 ? row.operationalCost / row.billing : null
        }
        return row[sortKey as keyof ResultatsGroupRow]
      }
      const av = metric(a)
      const bv = metric(b)
      const an = typeof av === 'number' ? av : av == null ? -Infinity : Number(av)
      const bn = typeof bv === 'number' ? bv : bv == null ? -Infinity : Number(bv)
      if (an !== bn) return mul * (an - bn)
      return a.label.localeCompare(b.label, 'ca')
    })
    return rows
  }, [view, byServiceType, byLocation, byMonth, sortKey, sortDir])

  const sortedItems = useMemo(() => {
    const rows = [...items]
    const mul = sortDir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (sortKey === 'label' || sortKey === 'eventDate') {
        const ka = sortKey === 'eventDate' ? a.eventDate : a.eventName
        const kb = sortKey === 'eventDate' ? b.eventDate : b.eventName
        return mul * ka.localeCompare(kb, 'ca')
      }
      const metric = (row: ResultatsItemRow) => {
        if (sortKey === 'cost') return row.operationalCost
        if (sortKey === 'margin') return row.contributionMargin
        if (sortKey === 'marginPct') {
          return row.billing > 0 ? row.contributionMargin / row.billing : null
        }
        if (sortKey === 'costPct') {
          return row.billing > 0 ? row.operationalCost / row.billing : null
        }
        return row[sortKey as keyof ResultatsItemRow]
      }
      const av = metric(a)
      const bv = metric(b)
      const an = typeof av === 'number' ? av : av == null ? -Infinity : Number(av)
      const bn = typeof bv === 'number' ? bv : bv == null ? -Infinity : Number(bv)
      if (an !== bn) return mul * (an - bn)
      return a.eventDate.localeCompare(b.eventDate)
    })
    return rows
  }, [items, sortKey, sortDir])

  const topBottom = useMemo(() => {
    if (view !== 'service' || byServiceType.length === 0) return null
    const withMargin = byServiceType
      .filter((r) => r.billing > 0)
      .sort(
        (a, b) =>
          b.contributionMargin / b.billing - a.contributionMargin / a.billing
      )
    const best = withMargin.slice(0, 3)
    const worst = [...withMargin].reverse().slice(0, 3)
    return { best, worst }
  }, [view, byServiceType])

  return (
    <div className="w-full space-y-6 pb-24">
      <ModuleHeader
        title="Resultats"
        subtitle="Marge operatiu i PE comercial (servei × propi/extern)"
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <Button
          type="button"
          size="sm"
          variant={mainTab === 'analisi' ? 'default' : 'outline'}
          onClick={() => setMainTab('analisi')}
        >
          Anàlisi
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mainTab === 'fixos' ? 'default' : 'outline'}
          onClick={() => setMainTab('fixos')}
        >
          Fixos i consolidat
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mainTab === 'pe' ? 'default' : 'outline'}
          onClick={() => setMainTab('pe')}
        >
          PE
        </Button>
      </div>

      {mainTab === 'pe' ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className={cn(corporateFilterLabelClass, 'block')}>
            Any
            <Input
              type="number"
              className={cn(corporateFilterFieldClass, 'mt-1 w-28')}
              value={peYear}
              onChange={(e) =>
                setPeYear(Number(e.target.value) || new Date().getFullYear())
              }
            />
          </label>
          <div className="text-xs text-slate-500 pb-2">
            Mitjanes de tot l’any (els mesos es calculen al darrere)
          </div>
        </div>
      ) : (
      <div className="flex flex-wrap items-end gap-3">
        <label className={cn(corporateFilterLabelClass, 'block')}>
          Mes ràpid
          <Input
            type="month"
            className={cn(corporateFilterFieldClass, 'mt-1 w-44')}
            value={ym}
            onChange={(e) => {
              setYm(e.target.value)
              setFromCustom('')
              setToCustom('')
            }}
          />
        </label>
        <label className={cn(corporateFilterLabelClass, 'block')}>
          Des de
          <Input
            type="date"
            className={cn(corporateFilterFieldClass, 'mt-1 w-40')}
            value={fromCustom || from}
            onChange={(e) => setFromCustom(e.target.value)}
          />
        </label>
        <label className={cn(corporateFilterLabelClass, 'block')}>
          Fins
          <Input
            type="date"
            className={cn(corporateFilterFieldClass, 'mt-1 w-40')}
            value={toCustom || to}
            onChange={(e) => setToCustom(e.target.value)}
          />
        </label>
        <div className="text-xs text-slate-500 pb-2">
          {from} → {to}
        </div>
      </div>
      )}

      {mainTab === 'pe' ? (
        <PeTab year={peYear} />
      ) : mainTab === 'fixos' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {VIEW_OPTIONS.map((opt) => (
              <Button
                key={opt.id}
                type="button"
                size="sm"
                variant={view === opt.id ? 'default' : 'outline'}
                onClick={() => setView(opt.id)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregant…</p>
          ) : error || data?.error ? (
            <p className="text-sm text-red-600">
              {data?.error || 'Error carregant dades'}
            </p>
          ) : !summary ? (
            <p className="text-sm text-slate-500">Sense dades.</p>
          ) : (
            <FixedCostsPanel
              summary={summary}
              items={items}
              groups={
                view === 'service'
                  ? byServiceType
                  : view === 'location'
                    ? byLocation
                    : byMonth
              }
              view={view}
              basis={fixedBasis}
              audit={fixedCostAudit}
              coverage={fixedCostCoverage}
              onBasis={setFixedBasis}
            />
          )}
        </>
      ) : (
        <>
      <div className="flex flex-wrap gap-2">
        {VIEW_OPTIONS.map((opt) => (
          <Button
            key={opt.id}
            type="button"
            size="sm"
            variant={view === opt.id ? 'default' : 'outline'}
            onClick={() => {
              setView(opt.id)
              setSortKey(opt.id === 'individual' ? 'eventDate' : 'marginPct')
              setSortDir(opt.id === 'individual' ? 'asc' : 'desc')
            }}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : error || data?.error ? (
        <p className="text-sm text-red-600">{data?.error || 'Error carregant dades'}</p>
      ) : !summary ? (
        <p className="text-sm text-slate-500">Sense dades.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Events" value={String(summary.eventCount)} />
            <KpiCard label="Facturació" value={fmtEuro(summary.billing)} />
            <KpiCard label="Cost variable" value={fmtEuro(summary.operationalCost)} />
            <KpiCard label="Marge contribució" value={fmtEuro(summary.contributionMargin)} />
            <KpiCard
              label="% marge contribució"
              value={fmtPct(
                summary.billing > 0
                  ? summary.contributionMargin / summary.billing
                  : null
              )}
            />
            <KpiCard
              label="% cost variable"
              value={fmtPct(
                summary.billing > 0
                  ? summary.operationalCost / summary.billing
                  : null
              )}
            />
          </div>

          {topBottom ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-emerald-800">
                  Millor marge %
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {topBottom.best.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2">
                      <span className="truncate">{r.label}</span>
                      <span className="tabular-nums text-emerald-800">
                        {fmtPct(r.billing > 0 ? r.contributionMargin / r.billing : null)}
                      </span>
                    </li>
                  ))}
                  {topBottom.best.length === 0 ? (
                    <li className="text-slate-500">Sense dades</li>
                  ) : null}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-900">
                  Pitjor marge %
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {topBottom.worst.map((r) => (
                    <li key={r.key} className="flex justify-between gap-2">
                      <span className="truncate">{r.label}</span>
                      <span className="tabular-nums text-amber-900">
                        {fmtPct(r.billing > 0 ? r.contributionMargin / r.billing : null)}
                      </span>
                    </li>
                  ))}
                  {topBottom.worst.length === 0 ? (
                    <li className="text-slate-500">Sense dades</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            {view === 'individual' ? (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <SortTh
                      label="Data"
                      sortKey="eventDate"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <SortTh
                      label="Esdeveniment"
                      sortKey="label"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <th className="px-3 py-2">Tipus</th>
                    <th className="px-3 py-2">Ubicació</th>
                    <SortTh
                      label="Facturació"
                      sortKey="billing"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Cost variable"
                      sortKey="cost"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Marge contribució"
                      sortKey="margin"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="% marge"
                      sortKey="marginPct"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="% cost"
                      sortKey="costPct"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((row) => (
                    <tr key={row.eventId} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap">{row.eventDate}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/menu/cost-serveis/edicio/${row.eventId}`}
                          className="text-cyan-700 hover:underline"
                        >
                          {row.eventName}
                        </Link>
                        {row.hasSheet ? (
                          <span className="ml-1 text-[10px] text-slate-400">desat</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {row.serviceType || '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600 max-w-[12rem] truncate">
                        {row.location || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtEuro(row.billing)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtEuro(row.operationalCost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtEuro(row.contributionMargin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          row.billing > 0
                            ? row.contributionMargin / row.billing
                            : null
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          row.billing > 0 ? row.operationalCost / row.billing : null
                        )}
                      </td>
                    </tr>
                  ))}
                  {sortedItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                        Cap event en aquest període.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <SortTh
                      label={
                        view === 'service'
                          ? 'Tipus de servei'
                          : view === 'location'
                            ? 'Ubicació'
                            : 'Mes'
                      }
                      sortKey="label"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                    />
                    <SortTh
                      label="Events"
                      sortKey="eventCount"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Pax"
                      sortKey="numPax"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Facturació"
                      sortKey="billing"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Cost variable"
                      sortKey="cost"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Marge contribució"
                      sortKey="margin"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="% marge"
                      sortKey="marginPct"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="% cost"
                      sortKey="costPct"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map((row) => (
                    <tr key={row.key} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.eventCount}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.numPax}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtEuro(row.billing)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtEuro(row.operationalCost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtEuro(row.contributionMargin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          row.billing > 0
                            ? row.contributionMargin / row.billing
                            : null
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(
                          row.billing > 0 ? row.operationalCost / row.billing : null
                        )}
                      </td>
                    </tr>
                  ))}
                  {sortedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                        Cap dada en aquest període.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
        </>
      )}
    </div>
  )
}

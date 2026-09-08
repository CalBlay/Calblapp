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
import PeTab from '@/app/menu/cost-serveis/resultats/PeTab'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type MainTab = 'analisi' | 'pe'
type ViewMode = 'individual' | 'service' | 'location' | 'month'

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

export default function CostServeisResultatsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('analisi')
  const [ym, setYm] = useState(currentYearMonth())
  const [fromCustom, setFromCustom] = useState('')
  const [toCustom, setToCustom] = useState('')
  const [peYear, setPeYear] = useState(() => new Date().getFullYear())
  const [view, setView] = useState<ViewMode>('service')
  const [sortKey, setSortKey] = useState<SortKey>('marginPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { from, to } = useMemo(() => {
    if (fromCustom && toCustom && fromCustom <= toCustom) {
      return { from: fromCustom, to: toCustom }
    }
    return monthRange(ym)
  }, [ym, fromCustom, toCustom])

  const { data, isLoading, error } = useSWR(
    mainTab === 'analisi'
      ? `/api/cost-serveis/resultats?from=${from}&to=${to}`
      : null,
    fetcher
  )

  const summary = (data?.summary || null) as ResultatsMetrics | null
  const items = (data?.items || []) as ResultatsItemRow[]
  const byServiceType = (data?.byServiceType || []) as ResultatsGroupRow[]
  const byLocation = (data?.byLocation || []) as ResultatsGroupRow[]
  const byMonth = (data?.byMonth || []) as ResultatsGroupRow[]

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
      const av = a[sortKey as keyof ResultatsGroupRow]
      const bv = b[sortKey as keyof ResultatsGroupRow]
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
      const av = a[sortKey as keyof ResultatsItemRow]
      const bv = b[sortKey as keyof ResultatsItemRow]
      const an = typeof av === 'number' ? av : av == null ? -Infinity : Number(av)
      const bn = typeof bv === 'number' ? bv : bv == null ? -Infinity : Number(bv)
      if (an !== bn) return mul * (an - bn)
      return a.eventDate.localeCompare(b.eventDate)
    })
    return rows
  }, [items, sortKey, sortDir])

  const topBottom = useMemo(() => {
    if (view !== 'service' || byServiceType.length === 0) return null
    const withMargin = byServiceType.filter((r) => r.marginPct != null)
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
            <KpiCard label="Cost" value={fmtEuro(summary.cost)} />
            <KpiCard label="Marge" value={fmtEuro(summary.margin)} />
            <KpiCard label="% marge" value={fmtPct(summary.marginPct)} />
            <KpiCard label="% cost operatiu" value={fmtPct(summary.costPct)} />
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
                      <span className="tabular-nums text-emerald-800">{fmtPct(r.marginPct)}</span>
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
                      <span className="tabular-nums text-amber-900">{fmtPct(r.marginPct)}</span>
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
                      label="Cost"
                      sortKey="cost"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Marge"
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
                        {fmtEuro(row.cost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtEuro(row.margin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(row.marginPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(row.costPct)}
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
                      label="Cost"
                      sortKey="cost"
                      active={sortKey}
                      dir={sortDir}
                      onSort={onSort}
                      className="text-right"
                    />
                    <SortTh
                      label="Marge"
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
                        {fmtEuro(row.cost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {fmtEuro(row.margin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(row.marginPct)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmtPct(row.costPct)}
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

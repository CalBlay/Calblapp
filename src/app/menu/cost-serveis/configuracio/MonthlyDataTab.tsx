'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import {
  canChooseCostDepartment,
  costDepartmentSelectOptions,
  resolveCostDepartmentFilter,
} from '@/lib/costServeis/access'
import { COST_SERVEIS_DEPT_LABELS } from '@/lib/costServeis/types'
import type {
  MonthlyCostIndicatorRow,
  MonthlyPotKey,
  MonthlyPotMetrics,
  MonthlySourceLine,
} from '@/lib/costServeis/monthlyIndicatorMath'
import { corporateFilterFieldClass, corporateFilterLabelClass } from '@/lib/corporate-filters'
import { cn } from '@/lib/utils'

const EMPTY_ROWS: MonthlyCostIndicatorRow[] = []
const POT_LABELS: Record<MonthlyPotKey, string> = {
  gestio: 'Gestió',
  preparacio: 'Preparació',
  rentat: 'Rentat',
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`)
  return json
}

const euro = (value: number | null) =>
  value == null
    ? '—'
    : value.toLocaleString('ca-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

const number = (value: number | null) =>
  value == null ? '—' : value.toLocaleString('ca-ES', { maximumFractionDigits: 2 })

function monthLabel(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('ca-ES', {
    month: 'short',
    year: 'numeric',
  })
}

function StatusBadge({ row }: { row: MonthlyCostIndicatorRow }) {
  const styles = {
    complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    incomplete: 'border-rose-200 bg-rose-50 text-rose-700',
  }
  const labels = { complete: 'Completa', warning: 'Avisos', incomplete: 'Incompleta' }
  return (
    <span
      className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium', styles[row.status])}
      title={row.warnings.join(' · ') || 'Dades completes'}
    >
      {labels[row.status]}
    </span>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn('mt-0.5 break-words text-sm font-semibold text-slate-900', accent)}>{value}</div>
    </div>
  )
}

function CostRow({
  label,
  metrics,
  sourceLines,
  emphasized = false,
}: {
  label: string
  metrics: MonthlyPotMetrics
  sourceLines: MonthlySourceLine[]
  emphasized?: boolean
}) {
  const originalCost = sourceLines.reduce(
    (sum, line) => sum + (line.costPersonalGross ?? line.costPersonal),
    0
  )
  const transferOut = sourceLines.reduce(
    (sum, line) => sum + (line.transferOut || 0),
    0
  )
  const transferIn = sourceLines.reduce(
    (sum, line) => sum + (line.transferIn || 0),
    0
  )
  return (
    <section className={cn('border-t border-slate-100 px-4 py-3', emphasized && 'bg-slate-50')}>
      <div className="grid grid-cols-3 items-center gap-2 sm:grid-cols-[minmax(130px,1fr)_repeat(3,minmax(0,1fr))]">
        <div className="col-span-3 min-w-0 sm:col-span-1">
          <span className={cn('text-sm font-medium text-slate-800', emphasized && 'font-semibold text-slate-950')}>
            {label}
          </span>
          {metrics.manualDeductions > 0 ? (
            <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              ajustat
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase text-slate-400 sm:hidden">Cost net</div>
          <div className="break-words text-sm font-semibold text-slate-900">{euro(metrics.netCost)}</div>
        </div>
        <div className="min-w-0 text-center sm:text-right">
          <div className="text-[10px] uppercase text-slate-400 sm:hidden">€/event</div>
          <div className="break-words text-sm font-semibold text-cyan-800">{euro(metrics.netCostPerEvent)}</div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] uppercase text-slate-400 sm:hidden">€/pax</div>
          <div className="break-words text-sm font-semibold text-violet-800">{euro(metrics.netCostPerPax)}</div>
        </div>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">
          Veure brut, ajustos i origen
        </summary>
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-2 sm:grid-cols-5">
            <div>
              <div className="text-[10px] uppercase text-slate-400">Original Opsia</div>
              <div className="font-medium text-slate-800">{euro(originalCost || metrics.grossCost)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Sortides</div>
              <div className="font-medium text-rose-700">−{euro(transferOut)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Entrades</div>
              <div className="font-medium text-emerald-700">+{euro(transferIn)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Després traspassos</div>
              <div className="font-medium text-slate-800">{euro(metrics.grossCost)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-400">Net final</div>
              <div className="font-semibold text-slate-950">{euro(metrics.netCost)}</div>
              {metrics.manualDeductions > 0 ? (
                <div className="text-[10px] text-slate-400">
                  −{euro(metrics.manualDeductions)} manual
                </div>
              ) : null}
            </div>
          </div>
          {sourceLines.length > 0 ? (
            <div className="mt-2 space-y-1">
              <div className="pb-1 font-medium text-slate-600">
                Línies d’Opsia incloses
              </div>
              {sourceLines.map((line, index) => (
                <div
                  key={`${line.deptCodi}-${index}`}
                  className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-2 py-1.5"
                >
                  <span className="min-w-0 text-slate-600">
                    <span className="font-medium text-slate-800">{line.deptNom || 'Sense nom'}</span>
                    {line.deptCodi ? <span className="ml-1 text-slate-400">· {line.deptCodi}</span> : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-medium text-slate-800">
                      {euro(line.costPersonal)}
                    </span>
                    {(line.transferOut || 0) > 0 || (line.transferIn || 0) > 0 ? (
                      <span className="block text-[10px] text-slate-400">
                        {euro(line.costPersonalGross ?? line.costPersonal)}
                        {' · '}
                        −{euro(line.transferOut || 0)} +{euro(line.transferIn || 0)}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-slate-200 px-2 pt-2 font-semibold text-slate-900">
                <span>Subtotal de les línies</span>
                <span>{euro(sourceLines.reduce((sum, line) => sum + line.costPersonal, 0))}</span>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-slate-500">
              Aquesta fotografia no conté el detall. Torna a generar l’any per incorporar-lo.
            </p>
          )}
        </div>
      </details>
    </section>
  )
}

function DepartmentPanel({ row }: { row: MonthlyCostIndicatorRow }) {
  const sourceLines = row.sourceLines || []
  const assignedLines = sourceLines.filter((line) => line.pot != null)
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{COST_SERVEIS_DEPT_LABELS[row.department]}</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">Dades Opsia · versió {row.calculationVersion}</p>
        </div>
        <div className="max-w-[60%] text-right">
          <StatusBadge row={row} />
          {row.warnings.length > 0 ? (
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{row.warnings.join(' · ')}</p>
          ) : null}
        </div>
      </header>
      <div className="hidden grid-cols-[minmax(130px,1fr)_repeat(3,minmax(0,1fr))] gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:grid">
        <div>Concepte</div>
        <div>Cost net</div>
        <div className="text-right">€/event</div>
        <div className="text-right">€/pax</div>
      </div>
      {(Object.entries(POT_LABELS) as Array<[MonthlyPotKey, string]>).map(([pot, label]) => (
        <CostRow
          key={pot}
          label={label}
          metrics={row.pots[pot]}
          sourceLines={sourceLines.filter((line) => line.pot === pot)}
        />
      ))}
      <CostRow
        label="Total estructura"
        metrics={row.totals}
        sourceLines={assignedLines}
        emphasized
      />
    </section>
  )
}

export function MonthlyDataTab() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const userDepartment = session?.user?.department
  const canChoose = canChooseCostDepartment(role, userDepartment)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [department, setDepartment] = useState('all')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const effectiveDepartment = useMemo(
    () => resolveCostDepartmentFilter({ role, department: userDepartment, requested: department }),
    [department, role, userDepartment]
  )
  const fromYm = `${year}-01`
  const toYm = `${year}-12`
  const endpoint = `/api/cost-serveis/monthly-indicators?from=${fromYm}&to=${toYm}&dept=${effectiveDepartment}`
  const { data, error, isLoading, mutate } = useSWR(endpoint, fetcher)
  const rows = (data?.rows as MonthlyCostIndicatorRow[] | undefined) ?? EMPTY_ROWS
  const monthGroups = useMemo(() => {
    const groups = new Map<string, MonthlyCostIndicatorRow[]>()
    for (const row of rows) {
      const group = groups.get(row.ym) || []
      group.push(row)
      groups.set(row.ym, group)
    }
    return Array.from(groups.entries()).map(([ym, monthRows]) => ({ ym, rows: monthRows }))
  }, [rows])
  const availableDepartmentOptions = costDepartmentSelectOptions(canChoose).filter(
    (option) => option.value !== 'serveis'
  )
  const departmentOptions = canChoose
    ? availableDepartmentOptions
    : availableDepartmentOptions.filter((option) => option.value === effectiveDepartment)

  const generate = async () => {
    setGenerating(true)
    setMessage('')
    try {
      const response = await fetch(
        `/api/cost-serveis/monthly-indicators?from=${fromYm}&to=${toYm}`,
        { method: 'POST' }
      )
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || `Error ${response.status}`)
      await mutate()
      setMessage(`${json.months || 0} mesos generats · ${json.eventFacts || 0} esdeveniments analitzats`)
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'No s’han pogut generar les dades')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div className="max-w-5xl space-y-2 text-sm text-slate-600">
        <p>
          Fotografia mensual dels pots d’Opsia i de l’activitat d’Empresa i Casaments.
          Les ràtios són informatives: encara no modifiquen el cost aplicat als esdeveniments.
        </p>
        <p className="text-xs text-slate-500">
          Es desen costos bruts, deduccions manuals, costos nets, denominadors i el detall
          dels esdeveniments utilitzats.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-[120px]">
            <span className={corporateFilterLabelClass}>Any</span>
            <input
              type="number"
              min={2020}
              max={2100}
              className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || year)}
            />
          </label>
          {departmentOptions.length > 1 ? (
            <label className="min-w-[180px]">
              <span className={corporateFilterLabelClass}>Departament</span>
              <select
                className={cn(corporateFilterFieldClass, 'mt-1 w-full')}
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                {departmentOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <Button onClick={() => void generate()} disabled={generating}>
          {generating ? 'Generant…' : 'Obtenir i desar dades de l’any'}
        </Button>
      </div>

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error instanceof Error ? error.message : 'Error carregant les dades'}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Carregant…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Encara no hi ha fotografies per a aquest any. Clica «Obtenir i desar dades de l’any».
        </p>
      ) : (
        <div className="space-y-5">
          {monthGroups.map(({ ym, rows: monthRows }) => {
            const activity = monthRows[0].activity
            return (
              <article key={ym} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <header className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mes analitzat</div>
                    <h2 className="mt-0.5 text-lg font-semibold capitalize text-slate-950">{monthLabel(ym)}</h2>
                  </div>
                  <div className="flex gap-6 text-right">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Events</div>
                      <div className="text-xl font-semibold text-slate-900">{number(activity.eventCount)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">Pax</div>
                      <div className="text-xl font-semibold text-slate-900">{number(activity.paxCount)}</div>
                    </div>
                  </div>
                </header>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric
                    label="Empresa"
                    value={`${activity.empresaEvents} events · ${number(activity.empresaPax)} pax`}
                  />
                  <Metric
                    label="Casaments"
                    value={`${activity.casamentsEvents} events · ${number(activity.casamentsPax)} pax`}
                  />
                  <Metric
                    label="Pax per event"
                    value={`Mitjana ${number(activity.averagePax)} · Mediana ${number(activity.medianPax)}`}
                  />
                  <Metric
                    label="Qualitat de l’activitat"
                    value={`${activity.excludedEvents} exclosos · ${activity.missingPaxEvents} sense pax`}
                  />
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {monthRows.map((row) => <DepartmentPanel key={row.id} row={row} />)}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          També es conserven la mitjana, mediana, mínim i màxim de pax, els esdeveniments
          exclosos, els que no tenen pax i la versió del càlcul de cada fotografia.
        </div>
      ) : null}
    </div>
  )
}

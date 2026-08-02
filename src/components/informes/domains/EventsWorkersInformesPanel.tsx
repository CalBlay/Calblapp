'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { INFORMES_DOMAINS } from '@/lib/informes/domains'
import type { EventsWorkersOverview } from '@/lib/informes/eventsWorkersOverview'
import { DataSourceLegend } from '@/components/informes/DataSourceLegend'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const EVENTS_META = INFORMES_DOMAINS.find((domain) => domain.id === 'events')!

function toYmd(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function defaultCustomRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return { from: toYmd(start), to: toYmd(end) }
}

function formatHours(value: number) {
  return `${value.toFixed(1)} h`
}

function formatSignedHours(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} h`
}

function deltaClasses(value: number) {
  if (value > 0) return 'text-red-600'
  if (value < 0) return 'text-emerald-600'
  return 'text-slate-500'
}

function roleBadgeClasses(role: string) {
  if (role === 'responsable') return 'border-amber-200 bg-amber-50 text-amber-900'
  if (role === 'conductor') return 'border-sky-200 bg-sky-50 text-sky-900'
  return 'border-violet-200 bg-violet-50 text-violet-900'
}

function rankingBarClasses(index: number) {
  if (index === 0) return 'bg-slate-900'
  if (index === 1) return 'bg-slate-700'
  if (index === 2) return 'bg-slate-500'
  return 'bg-slate-300'
}

function secondaryKpiSpanClass(count: number) {
  if (count <= 1) return 'xl:col-span-12'
  if (count === 2) return 'xl:col-span-6'
  if (count === 3) return 'xl:col-span-4'
  if (count === 4) return 'xl:col-span-3'
  return 'xl:col-span-2'
}

function RankingList({
  items,
  emptyLabel,
  valueFormatter,
}: {
  items: Array<{ id: string; label: string; sublabel?: string; value: number }>
  emptyLabel: string
  valueFormatter: (value: number) => string
}) {
  const max = Math.max(...items.map((item) => item.value), 1)

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.id} className="space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{item.label}</p>
              {item.sublabel ? (
                <p className="truncate text-xs text-slate-500">{item.sublabel}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-sm font-semibold text-slate-700">
              {valueFormatter(item.value)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={`h-2 rounded-full ${rankingBarClasses(index)}`}
              style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EventsWorkersInformesPanel() {
  const [tab, setTab] = useState<'kpis' | 'custom'>('kpis')
  const [days, setDays] = useState('30')
  const [kpiDepartment, setKpiDepartment] = useState('')
  const [kpiData, setKpiData] = useState<EventsWorkersOverview | null>(null)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [kpiError, setKpiError] = useState<string | null>(null)

  const defRange = useMemo(() => defaultCustomRange(), [])
  const [customDateFrom, setCustomDateFrom] = useState(defRange.from)
  const [customDateTo, setCustomDateTo] = useState(defRange.to)
  const [customDepartment, setCustomDepartment] = useState('')
  const [customWorkerName, setCustomWorkerName] = useState('')
  const [customRole, setCustomRole] = useState('')
  const [customOnlyClosed, setCustomOnlyClosed] = useState('0')
  const [customData, setCustomData] = useState<EventsWorkersOverview | null>(null)
  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [filterOptions, setFilterOptions] = useState<EventsWorkersOverview['filterOptions'] | null>(
    null
  )

  const loadKpis = useCallback(async () => {
    setKpiLoading(true)
    setKpiError(null)
    try {
      const params = new URLSearchParams()
      params.set('days', days)
      if (kpiDepartment) params.set('department', kpiDepartment)
      const res = await fetch(`/api/reports/events-workers/overview?${params}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setKpiData((await res.json()) as EventsWorkersOverview)
    } catch (error: unknown) {
      setKpiData(null)
      setKpiError(error instanceof Error ? error.message : String(error))
    } finally {
      setKpiLoading(false)
    }
  }, [days, kpiDepartment])

  useEffect(() => {
    void loadKpis()
  }, [loadKpis])

  useEffect(() => {
    if (tab !== 'custom') return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/reports/events-workers/filter-options', { cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as {
          filterOptions?: EventsWorkersOverview['filterOptions']
        }
        if (!cancelled) setFilterOptions(body.filterOptions ?? null)
      } catch {
        if (!cancelled) setFilterOptions(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  const mergedFilterOptions = useMemo(
    () => filterOptions ?? kpiData?.filterOptions ?? customData?.filterOptions ?? null,
    [customData?.filterOptions, filterOptions, kpiData?.filterOptions]
  )

  const runCustomReport = useCallback(async () => {
    setCustomLoading(true)
    setCustomError(null)
    try {
      const params = new URLSearchParams()
      params.set('dateFrom', customDateFrom)
      params.set('dateTo', customDateTo)
      if (customDepartment) params.set('department', customDepartment)
      if (customWorkerName) params.set('workerName', customWorkerName)
      if (customRole) params.set('role', customRole)
      if (customOnlyClosed === '1') params.set('onlyClosed', '1')

      const res = await fetch(`/api/reports/events-workers/overview?${params}`, {
        cache: 'no-store',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || res.statusText)
      }
      setCustomData((await res.json()) as EventsWorkersOverview)
    } catch (error: unknown) {
      setCustomData(null)
      setCustomError(error instanceof Error ? error.message : String(error))
    } finally {
      setCustomLoading(false)
    }
  }, [
    customDateFrom,
    customDateTo,
    customDepartment,
    customWorkerName,
    customRole,
    customOnlyClosed,
  ])

  const activeData = tab === 'kpis' ? kpiData : customData

  const trendPoints = useMemo(() => activeData?.trend.slice(-10) ?? [], [activeData])

  const primaryKpis = useMemo(() => {
    if (!activeData) return [] as EventsWorkersOverview['kpis']
    const order = ['Hores reals', 'Hores extres', 'Treballadors', 'No shows', 'Esdeveniments', 'Serveis']
    return order
      .map((label) => activeData.kpis.find((kpi) => kpi.label === label) ?? null)
      .filter((kpi): kpi is EventsWorkersOverview['kpis'][number] => kpi !== null)
  }, [activeData])

  const extraKpis = useMemo(() => {
    if (!activeData) return []
    const excluded = new Set(primaryKpis.map((kpi) => kpi.label))
    return activeData.kpis.filter((kpi) => !excluded.has(kpi.label))
  }, [activeData, primaryKpis])

  const topOvertimeWorkers = useMemo(
    () =>
      (activeData?.workers ?? [])
        .filter((worker) => worker.overtimeHours > 0)
        .sort((a, b) => b.overtimeHours - a.overtimeHours)
        .slice(0, 6)
        .map((worker) => ({
          id: `${worker.workerName}-${worker.department}-overtime`,
          label: worker.workerName,
          sublabel: `${worker.department || 'Sense departament'} · ${worker.servicesCount} serveis`,
          value: worker.overtimeHours,
        })),
    [activeData]
  )

  const topDeviationWorkers = useMemo(
    () =>
      (activeData?.workers ?? [])
        .filter((worker) => worker.deviationHours > 0)
        .sort((a, b) => b.deviationHours - a.deviationHours)
        .slice(0, 6)
        .map((worker) => ({
          id: `${worker.workerName}-${worker.department}-deviation`,
          label: worker.workerName,
          sublabel: `${worker.department || 'Sense departament'} · ${formatHours(
            worker.contractedRangeHours
          )} contractades`,
          value: worker.deviationHours,
        })),
    [activeData]
  )

  const topResponsibleWorkers = useMemo(
    () =>
      (activeData?.workers ?? [])
        .filter((worker) => worker.responsibleEventsCount > 0)
        .sort((a, b) => b.responsibleEventsCount - a.responsibleEventsCount)
        .slice(0, 6)
        .map((worker) => ({
          id: `${worker.workerName}-${worker.department}-responsible`,
          label: worker.workerName,
          sublabel: `${worker.department || 'Sense departament'} · ${formatHours(worker.actualHours)} reals`,
          value: worker.responsibleEventsCount,
        })),
    [activeData]
  )

  return (
    <div className="w-full space-y-4">
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={tab === 'kpis' ? 'default' : 'outline'}
              onClick={() => setTab('kpis')}
            >
              KPIs
            </Button>
            <Button
              type="button"
              variant={tab === 'custom' ? 'default' : 'outline'}
              onClick={() => setTab('custom')}
            >
              Informe a mida
            </Button>
          </div>
          <DataSourceLegend sources={EVENTS_META.sources} />
        </div>

        {tab === 'kpis' ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[180px_220px] xl:grid-cols-12">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="events-workers-days">Període</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger id="events-workers-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Últims 7 dies</SelectItem>
                  <SelectItem value="30">Últims 30 dies</SelectItem>
                  <SelectItem value="90">Últims 90 dies</SelectItem>
                  <SelectItem value="180">Últims 180 dies</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label>Departament</Label>
              <Select
                value={kpiDepartment || '__all__'}
                onValueChange={(value) => setKpiDepartment(value === '__all__' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(mergedFilterOptions?.departments ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:col-span-8 xl:grid-cols-4">
              {primaryKpis.slice(0, 4).map((kpi) => (
                <article key={`top-strip-${kpi.label}`} className="rounded-xl border bg-slate-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{kpi.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{kpi.value}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-12">
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="events-workers-from">Des de</Label>
              <Input
                id="events-workers-from"
                type="date"
                value={customDateFrom}
                onChange={(e) => setCustomDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label htmlFor="events-workers-to">Fins a</Label>
              <Input
                id="events-workers-to"
                type="date"
                value={customDateTo}
                onChange={(e) => setCustomDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label>Departament</Label>
              <Select
                value={customDepartment || '__all__'}
                onValueChange={(value) => setCustomDepartment(value === '__all__' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(mergedFilterOptions?.departments ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label>Treballador</Label>
              <Select
                value={customWorkerName || '__all__'}
                onValueChange={(value) => setCustomWorkerName(value === '__all__' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  {(mergedFilterOptions?.workers ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label>Rol</Label>
              <Select
                value={customRole || '__all__'}
                onValueChange={(value) => setCustomRole(value === '__all__' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tots</SelectItem>
                  <SelectItem value="responsable">Responsable</SelectItem>
                  <SelectItem value="conductor">Conductor</SelectItem>
                  <SelectItem value="treballador">Treballador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-2">
              <Label>Només tancats</Label>
              <Select value={customOnlyClosed} onValueChange={setCustomOnlyClosed}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Incloure tots</SelectItem>
                  <SelectItem value="1">Només tancats</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                className="w-full"
                onClick={() => void runCustomReport()}
                disabled={customLoading}
              >
                {customLoading ? 'Generant...' : 'Generar'}
              </Button>
            </div>
          </div>
        )}
      </section>

      {kpiError ? <p className="text-sm text-red-600">{kpiError}</p> : null}
      {customError ? <p className="text-sm text-red-600">{customError}</p> : null}
      {(kpiLoading && tab === 'kpis') || (customLoading && tab === 'custom') ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          Carregant...
        </div>
      ) : null}

      {activeData ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-12">
            {primaryKpis.map((kpi) => (
              <article key={kpi.label} className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{kpi.label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-950">{kpi.value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-12">
            {extraKpis.map((kpi) => (
              <article
                key={kpi.label}
                className={`rounded-2xl border bg-card p-4 shadow-sm ${secondaryKpiSpanClass(extraKpis.length)}`}
              >
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{kpi.label}</p>
                <p className="mt-2 text-xl font-semibold text-slate-950">{kpi.value}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                  Planificat vs Real
                </h3>
              </div>
              <div className="grid gap-3">
                {trendPoints.map((point) => {
                  const base = Math.max(point.plannedHours, point.actualHours, 1)
                  const diff = point.actualHours - point.plannedHours
                  return (
                    <div key={point.label} className="rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-slate-900">{point.label}</span>
                        <span className={`text-sm font-semibold ${deltaClasses(diff)}`}>
                          {formatSignedHours(diff)}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                            <span>Planificat</span>
                            <span>{formatHours(point.plannedHours)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-slate-300"
                              style={{ width: `${Math.max(6, (point.plannedHours / base) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                            <span>Real</span>
                            <span>{formatHours(point.actualHours)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-slate-900"
                              style={{ width: `${Math.max(6, (point.actualHours / base) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
              <h3 className="mb-4 text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Ranking Extres
              </h3>
              <RankingList
                items={topOvertimeWorkers}
                emptyLabel="Sense extres"
                valueFormatter={formatHours}
              />
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
              <h3 className="mb-4 text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Ranking Desviació
              </h3>
              <RankingList
                items={topDeviationWorkers}
                emptyLabel="Sense desviació positiva"
                valueFormatter={formatHours}
              />
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-2">
              <h3 className="mb-4 text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Ranking Responsables
              </h3>
              <RankingList
                items={topResponsibleWorkers}
                emptyLabel="Sense responsables"
                valueFormatter={(value) => `${value}`}
              />
            </section>
          </section>

          <section className="grid gap-4 xl:grid-cols-12">
            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Resum per Treballador
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treballador</TableHead>
                    <TableHead>Departament</TableHead>
                    <TableHead>Serveis</TableHead>
                    <TableHead>Esdeveniments</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Planificades</TableHead>
                    <TableHead>Reals</TableHead>
                    <TableHead>Contractades</TableHead>
                    <TableHead>Desviació</TableHead>
                    <TableHead>Extres</TableHead>
                    <TableHead>No Shows</TableHead>
                    <TableHead>Sortides Abans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.workers.map((row) => (
                    <TableRow key={`${row.workerName}-${row.department}`} className="hover:bg-slate-50">
                      <TableCell className="font-medium text-slate-950">{row.workerName}</TableCell>
                      <TableCell>{row.department || '—'}</TableCell>
                      <TableCell>{row.servicesCount}</TableCell>
                      <TableCell>{row.eventsCount}</TableCell>
                      <TableCell>{row.responsibleEventsCount}</TableCell>
                      <TableCell>{formatHours(row.plannedHours)}</TableCell>
                      <TableCell>{formatHours(row.actualHours)}</TableCell>
                      <TableCell>{formatHours(row.contractedRangeHours)}</TableCell>
                      <TableCell className={deltaClasses(row.deviationHours)}>
                        {formatSignedHours(row.deviationHours)}
                      </TableCell>
                      <TableCell>{formatHours(row.overtimeHours)}</TableCell>
                      <TableCell>{row.noShowCount}</TableCell>
                      <TableCell>{row.leftEarlyCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm xl:col-span-7">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-[0.12em] text-slate-500 uppercase">
                Detall de Serveis
              </h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Esdeveniment</TableHead>
                    <TableHead>Treballador</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Departament</TableHead>
                    <TableHead>Inici</TableHead>
                    <TableHead>Fi Prev.</TableHead>
                    <TableHead>Fi Real</TableHead>
                    <TableHead>Hores Reals</TableHead>
                    <TableHead>No Show</TableHead>
                    <TableHead>Marxa Abans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeData.entries.map((row, index) => (
                    <TableRow key={`${row.eventId}-${row.workerName}-${index}`} className="hover:bg-slate-50">
                      <TableCell>{row.eventDate || '—'}</TableCell>
                      <TableCell>
                        <div className="min-w-[240px]">
                          <p className="font-medium text-slate-950">{row.eventName || row.eventCode || '—'}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.location || row.eventCode || '—'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-950">{row.workerName}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${roleBadgeClasses(
                            row.role
                          )}`}
                        >
                          {row.role}
                        </span>
                      </TableCell>
                      <TableCell>{row.department || '—'}</TableCell>
                      <TableCell>{row.plannedStartTime || '—'}</TableCell>
                      <TableCell>{row.plannedEndTime || '—'}</TableCell>
                      <TableCell>{row.realEndTime || '—'}</TableCell>
                      <TableCell>{formatHours(row.actualHours)}</TableCell>
                      <TableCell>{row.noShow ? 'Sí' : 'No'}</TableCell>
                      <TableCell>{row.leftEarly ? 'Sí' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </section>
          </section>
        </>
      ) : null}
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  getPreparationEventName,
  type LogisticsEventPrepRow,
} from '@/lib/logistics/prepTypes'
import {
  computePreparationProgressSummary,
  statusLabel,
  type PrepLineProgress,
} from '@/lib/logistics/preparationProgress'
import { PREPARATION_WAREHOUSE_LABELS } from '@/lib/logistics/preparationWarehouses'
import PreparationWarehouseToggles from '@/components/logistics/PreparationWarehouseToggles'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Loader2, MapPin, Package, Truck } from 'lucide-react'
import type { LogisticsPreparationDashboardDetail } from '@/lib/logistics/logisticsLoading.server'
import { formatDateOnly } from '@/lib/date-format'
import { cn } from '@/lib/utils'

type CardView = 'preparers' | 'pending' | 'loading'

async function dashboardDetailsFetcher([url, rowIds]: [string, string[]]) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rowIds }),
  })
  const json = (await response.json().catch(() => ({}))) as {
    details?: LogisticsPreparationDashboardDetail[]
    error?: string
  }
  if (!response.ok) {
    throw new Error(json.error || 'No s\'han pogut carregar els detalls.')
  }
  return Array.isArray(json.details) ? json.details : []
}

function ProgressRing({ pct, size = 112 }: { pct: number; size?: number }) {
  const stroke = 9
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safePct = Math.min(100, Math.max(0, pct))
  const offset = circumference - (safePct / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={safePct >= 100 ? '#059669' : safePct >= 34 ? '#3b82f6' : '#f59e0b'}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{safePct}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">mitjana</span>
      </div>
    </div>
  )
}

function PrepLineCard({
  line,
  detail,
  detailsLoading,
  resolvingKey,
  onResolvePending,
}: {
  line: PrepLineProgress
  detail?: LogisticsPreparationDashboardDetail
  detailsLoading: boolean
  resolvingKey: string
  onResolvePending: (
    line: LogisticsPreparationDashboardDetail['warehouses'][number]['loadingLines'][number],
    resolution: 'prepared' | 'left_unprepared'
  ) => void
}) {
  const { row, status, pct } = line
  const [view, setView] = useState<CardView>('preparers')
  const eventDate = row.EventDate || row.DataInici
  const allWarehouses = Object.entries(PREPARATION_WAREHOUSE_LABELS).map(([code, label]) => ({
    code: code as keyof typeof PREPARATION_WAREHOUSE_LABELS,
    label,
  }))
  const pendingWarehouseCount = allWarehouses.filter(({ code }) => {
    const warehouse = detail?.warehouses.find((item) => item.warehouseCode === code)
    return !line.warehouseMap[code]?.at && !warehouse?.preparationCompleted
  }).length
  const pendingArticleCount = detail?.warehouses.reduce(
    (total, warehouse) => total + warehouse.pendingArticles.length,
    0
  ) || 0
  const preparationNotes = detail?.warehouses.filter((warehouse) => warehouse.preparationNotes) || []

  return (
    <article
      className={cn(
        'rounded-2xl border border-slate-200 p-4 shadow-sm',
        status === 'complete' && 'border-emerald-200 bg-emerald-50/50',
        status === 'in_progress' && 'border-sky-200 bg-sky-50/40',
        status === 'not_started' && 'bg-white',
        status === 'unscheduled' && 'border-dashed bg-slate-50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {statusLabel(status, pct)}
          </div>
          <h3 className="mt-1 text-base font-bold text-slate-900">
            {getPreparationEventName(row) || 'Sense nom'}
          </h3>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums text-slate-900">{row.PreparacioHora || '--:--'}</div>
          <div className="text-xs text-slate-500">{formatDateOnly(eventDate, '')}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
        {row.EventCode ? <span className="font-semibold">{row.EventCode}</span> : null}
        {row.Ubicacio ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {row.Ubicacio}
          </span>
        ) : null}
      </div>

      {status !== 'unscheduled' ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 text-xs font-semibold shadow-sm">
            <button
              type="button"
              aria-pressed={view === 'preparers'}
              onClick={() => setView('preparers')}
              className={cn('min-h-9 rounded-lg px-2', view === 'preparers' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}
            >
              Preparadors
            </button>
            <button
              type="button"
              aria-pressed={view === 'pending'}
              onClick={() => setView('pending')}
              className={cn('min-h-9 rounded-lg px-2', view === 'pending' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50')}
            >
              Pendents {pendingWarehouseCount + pendingArticleCount > 0 ? `(${pendingWarehouseCount + pendingArticleCount})` : ''}
            </button>
            <button
              type="button"
              aria-pressed={view === 'loading'}
              onClick={() => setView('loading')}
              className={cn('min-h-9 rounded-lg px-2', view === 'loading' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50')}
            >
              Càrrega {detail?.loadableCount ? `${detail.loadedCount}/${detail.loadableCount}` : ''}
            </button>
          </div>

          {preparationNotes.length ? (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Observacions dels preparadors
              </div>
              {preparationNotes.map((warehouse) => (
                <div key={`${row.id}-notes-${warehouse.warehouseCode}`} className="rounded-lg bg-white/80 px-3 py-2">
                  <div className="text-xs font-semibold text-amber-800">
                    {PREPARATION_WAREHOUSE_LABELS[warehouse.warehouseCode as keyof typeof PREPARATION_WAREHOUSE_LABELS] || warehouse.warehouseCode}
                    {warehouse.preparationNotesUpdatedByName ? ` · ${warehouse.preparationNotesUpdatedByName}` : ''}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {warehouse.preparationNotes}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {view === 'preparers' ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <PreparationWarehouseToggles
                rowId={row.id}
                completionMap={row.PreparacioMagatzems}
                allowedWarehouses={allWarehouses}
                readOnly
              />
              <div className="space-y-1 text-xs text-slate-600">
                {allWarehouses.map(({ code, label }) => {
                  const entry = line.warehouseMap[code]
                  if (!entry?.at) return null
                  return (
                    <div key={`${row.id}-${code}`}>
                      <span className="font-semibold text-slate-800">{label}:</span>{' '}
                      {entry.userName || 'Sense registrar'}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          {view === 'pending' ? (
            detailsLoading ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregant pendents…
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {allWarehouses.map(({ code, label }) => {
                  const warehouse = detail?.warehouses.find((item) => item.warehouseCode === code)
                  const completed = Boolean(line.warehouseMap[code]?.at || warehouse?.preparationCompleted)
                  const pendingArticles = warehouse?.pendingArticles || []
                  const ready = completed && pendingArticles.length === 0
                  return (
                    <div key={`${row.id}-pending-${code}`} className={cn('rounded-xl border p-3', ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
                      <div className="flex items-center gap-2 text-sm font-bold">
                        {ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                        {label}
                      </div>
                      <p className={cn('mt-1 text-xs', ready ? 'text-emerald-700' : 'text-amber-800')}>
                        {completed ? (pendingArticles.length ? `${pendingArticles.length} articles pendents` : 'Preparació completada') : 'Pendent de finalitzar'}
                      </p>
                      {pendingArticles.length ? (
                        <div className="mt-2 space-y-1">
                          {pendingArticles.map((item) => (
                            <div key={item.articleCode} className="flex justify-between gap-2 rounded-lg bg-white/80 px-2 py-1 text-xs text-slate-700">
                              <span className="min-w-0 truncate">
                                {item.articleName}
                                {item.loadingResolution === 'left_unprepared' ? (
                                  <span className="ml-1 font-bold text-red-700">· Sense preparar</span>
                                ) : null}
                              </span>
                              <span className="shrink-0 font-bold">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )
          ) : null}

          {view === 'loading' ? (
            detailsLoading ? (
              <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregant checklist…
              </div>
            ) : detail?.warehouses.some((warehouse) => warehouse.loadingLines.length) ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {allWarehouses.map(({ code, label }) => {
                  const lines = detail.warehouses.find((item) => item.warehouseCode === code)?.loadingLines || []
                  if (!lines.length) return null
                  const loadable = lines.filter((item) => item.ready)
                  const loaded = loadable.filter((item) => item.loaded).length
                  return (
                    <div key={`${row.id}-loading-${code}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                        <span className="text-sm font-bold text-slate-900">{label}</span>
                        <span className="text-xs font-bold text-slate-500">{loaded}/{loadable.length}</span>
                      </div>
                      <div className="space-y-1.5 p-2">
                        {lines.map((item) => (
                          <div key={item.key} className={cn('rounded-lg px-2 py-2 text-xs', !item.ready ? item.pendingResolution === 'left_unprepared' ? 'bg-red-50 text-red-900' : 'bg-amber-50 text-amber-900' : item.loaded ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-700')}>
                            <div className="flex items-center gap-2">
                              {!item.ready ? <AlertTriangle className="h-4 w-4 shrink-0" /> : item.loaded ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Truck className="h-4 w-4 shrink-0" />}
                              <span className={cn('min-w-0 flex-1 truncate', item.loaded && 'line-through')}>{item.label}</span>
                              <span className="shrink-0 font-bold">{item.quantity}</span>
                            </div>
                            {!item.ready && item.pendingResolution !== 'left_unprepared' && item.pendingRefs?.length ? (
                              <div className="mt-2 grid grid-cols-2 gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                                  disabled={resolvingKey === item.key}
                                  onClick={() => onResolvePending(item, 'prepared')}
                                >
                                  Preparat
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-red-200 text-xs text-red-700"
                                  disabled={resolvingKey === item.key}
                                  onClick={() => onResolvePending(item, 'left_unprepared')}
                                >
                                  Sense preparar
                                </Button>
                              </div>
                            ) : null}
                            {item.pendingResolution === 'left_unprepared' ? (
                              <div className="mt-1 text-[11px] font-semibold">
                                Queda sense preparar{item.pendingResolvedByName ? ` · ${item.pendingResolvedByName}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                Encara no hi ha material registrat per carregar.
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default function PreparationProgressDashboard({
  rows,
  dateRange,
}: {
  rows: LogisticsEventPrepRow[]
  dateRange: { start: string; end: string } | null
}) {
  const summary = useMemo(() => computePreparationProgressSummary(rows), [rows])
  const detailRowIds = useMemo(
    () => rows.filter((row) => !row.id.startsWith('draft_')).map((row) => row.id),
    [rows]
  )
  const {
    data: details = [],
    isLoading: detailsLoading,
    mutate: mutateDetails,
  } = useSWR(
    detailRowIds.length
      ? ['/api/logistics/preparation-dashboard-details', detailRowIds] as [string, string[]]
      : null,
    dashboardDetailsFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  )
  const detailsByRowId = useMemo(
    () => new Map(details.map((detail) => [detail.eventRowId, detail])),
    [details]
  )
  const [resolvingKey, setResolvingKey] = useState('')
  const [detailActionError, setDetailActionError] = useState('')

  const resolvePending = async (
    line: LogisticsPreparationDashboardDetail['warehouses'][number]['loadingLines'][number],
    resolution: 'prepared' | 'left_unprepared'
  ) => {
    if (!line.pendingRefs?.length) return
    setResolvingKey(line.key)
    setDetailActionError('')
    try {
      const response = await fetch('/api/logistics/loading/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: line.pendingRefs, resolution }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut actualitzar el pendent.'))
      await mutateDetails()
    } catch (error) {
      setDetailActionError(error instanceof Error ? error.message : 'No s’ha pogut actualitzar el pendent.')
    } finally {
      setResolvingKey('')
    }
  }

  const linesByDay = useMemo(() => {
    const map = new Map<string, PrepLineProgress[]>()
    summary.lines.forEach((line) => {
      if (line.status === 'unscheduled') return
      const key = line.row.PreparacioData || 'sense-data'
      const bucket = map.get(key) || []
      bucket.push(line)
      map.set(key, bucket)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [summary.lines])

  const rangeLabel =
    dateRange?.start && dateRange?.end
      ? dateRange.start === dateRange.end
        ? formatDateOnly(dateRange.start, '')
        : `${formatDateOnly(dateRange.start, '')} – ${formatDateOnly(dateRange.end, '')}`
      : 'Sense rang'

  if (summary.totalCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
        <CalendarDays className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-600">
          No hi ha línies de preparació dins del rang seleccionat.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-lg">
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <div className="rounded-full bg-white p-2 shadow-xl">
              <ProgressRing pct={summary.averageCompletionPct} />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                Panoràmica del rang
              </div>
              <div className="mt-1 text-2xl font-bold">{rangeLabel}</div>
              <div className="mt-1 text-sm text-slate-300">
                {summary.completeCount} completades · {summary.inProgressCount} en curs ·{' '}
                {summary.notStartedCount} sense començar
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {summary.warehouseSummaries.map((warehouse) => (
                <div
                  key={warehouse.warehouse}
                  className="rounded-xl bg-white/10 px-3 py-3 ring-1 ring-white/10"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Package className="h-4 w-4 text-emerald-300" />
                    {warehouse.label}
                  </div>
                  <div className="mt-2 text-2xl font-bold tabular-nums">
                    {warehouse.doneCount}/{warehouse.plannedCount}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${warehouse.pct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-slate-300">{warehouse.pct}% de les línies planificades</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Detall per dia</h2>
        {detailActionError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {detailActionError}
          </p>
        ) : null}
        {linesByDay.map(([dayKey, dayLines]) => (
          <div key={dayKey} className="space-y-3">
            <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
              {formatDateOnly(dayKey, dayKey)} · {dayLines.length} línies
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dayLines.map((line) => (
                <PrepLineCard
                  key={line.row.id}
                  line={line}
                  detail={detailsByRowId.get(line.row.id)}
                  detailsLoading={detailsLoading}
                  resolvingKey={resolvingKey}
                  onResolvePending={resolvePending}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

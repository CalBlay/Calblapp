'use client'

import { useMemo } from 'react'
import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'
import {
  computePreparationProgressSummary,
  statusLabel,
  type PrepLineProgress,
} from '@/lib/logistics/preparationProgress'
import { PREPARATION_WAREHOUSE_LABELS } from '@/lib/logistics/preparationWarehouses'
import PreparationWarehouseToggles from '@/components/logistics/PreparationWarehouseToggles'
import { CalendarDays, MapPin, Package } from 'lucide-react'
import { formatDateOnly } from '@/lib/date-format'
import { cn } from '@/lib/utils'

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

function PrepLineCard({ line }: { line: PrepLineProgress }) {
  const { row, status, pct } = line
  const allWarehouses = Object.entries(PREPARATION_WAREHOUSE_LABELS).map(([code, label]) => ({
    code: code as keyof typeof PREPARATION_WAREHOUSE_LABELS,
    label,
  }))

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
          <h3 className="mt-1 text-base font-bold text-slate-900">{row.NomEvent || 'Sense nom'}</h3>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums text-slate-900">{row.PreparacioHora || '--:--'}</div>
          <div className="text-xs text-slate-500">{formatDateOnly(row.PreparacioData, '')}</div>
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
        <div className="mt-3 space-y-2">
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
        {linesByDay.map(([dayKey, dayLines]) => (
          <div key={dayKey} className="space-y-3">
            <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
              {formatDateOnly(dayKey, dayKey)} · {dayLines.length} línies
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dayLines.map((line) => (
                <PrepLineCard key={line.row.id} line={line} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

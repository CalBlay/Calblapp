'use client'

import { useState } from 'react'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import useSWR from 'swr'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Truck,
} from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import FiltersBar, { type FiltersState } from '@/components/layout/FiltersBar'
import { Button } from '@/components/ui/button'
import { RoleGuard } from '@/lib/withRoleGuard'
import type {
  LogisticsLoadingEvent,
  LogisticsLoadingLine,
} from '@/lib/logistics/logisticsLoading.server'
import {
  PREPARATION_WAREHOUSE_CODES,
  PREPARATION_WAREHOUSE_LABELS,
  isPreparationWarehouseCode,
} from '@/lib/logistics/preparationWarehouses'
import { cn } from '@/lib/utils'

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut carregar la llista.'))
  return json as { ok: boolean; events: LogisticsLoadingEvent[] }
}

function formatDateTime(value: string) {
  const [date = '', time = ''] = value.split('T')
  if (!date) return 'Sense data'
  const [year, month, day] = date.split('-')
  return `${day}/${month}/${year}${time ? ` · ${time}` : ''}`
}

function LoadingLine({
  eventKey,
  line,
  busy,
  onToggle,
  onResolvePending,
}: {
  eventKey: string
  line: LogisticsLoadingLine
  busy: boolean
  onToggle: (eventKey: string, line: LogisticsLoadingLine) => void
  onResolvePending: (
    eventKey: string,
    line: LogisticsLoadingLine,
    resolution: 'prepared' | 'left_unprepared'
  ) => void
}) {
  if (!line.ready) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="break-words font-semibold leading-snug text-amber-950">{line.label}</div>
            <div className="mt-1 text-xs leading-relaxed text-amber-800">
              {line.pendingResolution === 'left_unprepared'
                ? `Queda sense preparar${line.pendingResolvedByName ? ` · ${line.pendingResolvedByName}` : ''}`
                : 'Cal decidir abans de carregar'}
            </div>
          </div>
          <div className="min-w-12 shrink-0 rounded-lg bg-white px-3 py-2 text-center text-lg font-bold text-amber-950 shadow-sm">
            {line.quantity}
          </div>
        </div>
        {line.pendingResolution !== 'left_unprepared' && line.pendingRefs?.length ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="min-w-0 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={() => onResolvePending(eventKey, line, 'prepared')}
            >
              Preparat
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-0 border-red-200 bg-white text-red-700 hover:bg-red-50"
              disabled={busy}
              onClick={() => onResolvePending(eventKey, line, 'left_unprepared')}
            >
              Sense preparar
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <label
      className={cn(
        'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
        line.loaded
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-200 bg-white hover:border-emerald-300'
      )}
    >
      <input
        type="checkbox"
        checked={line.loaded}
        disabled={busy}
        onChange={() => onToggle(eventKey, line)}
        className="h-6 w-6 shrink-0 accent-emerald-600"
      />
      <div className="min-w-0 flex-1">
        <div className={cn('font-semibold text-slate-900', line.loaded && 'text-emerald-800 line-through')}>
          {line.label}
        </div>
        <div className="text-xs text-slate-500">
          {line.warehouseCodes.join(' · ') || 'Logística'}
          {line.loadedByName ? ` · Carregat per ${line.loadedByName}` : ''}
        </div>
      </div>
      <div className={cn('min-w-12 rounded-lg px-3 py-2 text-center text-lg font-bold', line.loaded ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-800')}>
        {line.quantity}
      </div>
    </label>
  )
}

function LoadingEventCard({
  event,
  busyKey,
  onToggle,
  onResolvePending,
}: {
  event: LogisticsLoadingEvent
  busyKey: string
  onToggle: (eventKey: string, line: LogisticsLoadingLine) => void
  onResolvePending: (
    eventKey: string,
    line: LogisticsLoadingLine,
    resolution: 'prepared' | 'left_unprepared'
  ) => void
}) {
  const pct = event.loadableCount
    ? Math.round((event.loadedCount / event.loadableCount) * 100)
    : 0
  const warehouseGroups = new Map<string, LogisticsLoadingLine[]>()
  for (const line of event.lines) {
    const warehouseCode = line.warehouseCodes[0] || 'LOGISTICA'
    const current = warehouseGroups.get(warehouseCode) || []
    current.push(line)
    warehouseGroups.set(warehouseCode, current)
  }
  const orderedWarehouseGroups = [...warehouseGroups.entries()].sort(([left], [right]) => {
    const leftIndex = PREPARATION_WAREHOUSE_CODES.indexOf(left as never)
    const rightIndex = PREPARATION_WAREHOUSE_CODES.indexOf(right as never)
    const safeLeft = leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex
    const safeRight = rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex
    return safeLeft - safeRight || left.localeCompare(right, 'ca')
  })
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <header className="border-b border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <Truck className="h-4 w-4" /> {event.eventCode || 'Sense codi'}
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-950 sm:text-xl">{event.eventName}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {formatDateTime(event.startKey)} → {formatDateTime(event.endKey)}
              {event.location ? ` · ${event.location}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">
              {event.loadedCount}/{event.loadableCount} carregat
            </span>
            {event.pendingPreparationCount > 0 ? (
              <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
                {event.pendingPreparationCount} pendent de preparar
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </header>
      {event.preparationNotes.length ? (
        <section className="border-b border-slate-200 bg-amber-50 px-4 py-4 sm:px-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-800">Observacions dels preparadors</h3>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {event.preparationNotes.map((note) => {
              const warehouseName = isPreparationWarehouseCode(note.warehouseCode)
                ? PREPARATION_WAREHOUSE_LABELS[note.warehouseCode]
                : note.warehouseCode
              return (
                <div key={note.key} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="text-xs font-semibold text-amber-800">
                    {warehouseName || 'Logística'}
                    {note.preparationName ? ` · ${note.preparationName}` : ''}
                    {note.updatedByName ? ` · ${note.updatedByName}` : ''}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{note.notes}</p>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
      <div className="grid items-start gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))] sm:p-4">
        {orderedWarehouseGroups.map(([warehouseCode, lines]) => {
          const warehouseName = isPreparationWarehouseCode(warehouseCode)
            ? PREPARATION_WAREHOUSE_LABELS[warehouseCode]
            : warehouseCode
          const readyLines = lines.filter((line) => line.ready)
          const loadedLines = readyLines.filter((line) => line.loaded).length
          return (
            <section key={warehouseCode} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/70">
              <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Magatzem</div>
                  <h3 className="font-bold text-slate-950">{warehouseName}</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                  {loadedLines}/{readyLines.length}
                </span>
              </header>
              <div className="space-y-2 p-2">
                {lines.map((line) => (
                  <LoadingLine
                    key={line.key}
                    eventKey={event.eventKey}
                    line={line}
                    busy={busyKey === `${event.eventKey}::${line.key}`}
                    onToggle={onToggle}
                    onResolvePending={onResolvePending}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </article>
  )
}

export default function LogisticsTruckLoadingPage() {
  const [filters, setFilters] = useState<FiltersState>(() => {
    const today = new Date()
    return {
      start: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      end: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      mode: 'week',
    }
  })
  const [busyKey, setBusyKey] = useState('')
  const [actionError, setActionError] = useState('')
  const key = filters.start && filters.end && filters.start <= filters.end
    ? `/api/logistics/loading?start=${encodeURIComponent(filters.start)}&end=${encodeURIComponent(filters.end)}`
    : null
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })
  const events = data?.events || []

  const toggleLine = async (eventKey: string, line: LogisticsLoadingLine) => {
    const nextLoaded = !line.loaded
    const rowKey = `${eventKey}::${line.key}`
    setBusyKey(rowKey)
    setActionError('')
    const previous = data
    await mutate(
      (current) => current
        ? {
            ...current,
            events: current.events.map((event) => {
              if (event.eventKey !== eventKey) return event
              const lines = event.lines.map((item) =>
                item.key === line.key ? { ...item, loaded: nextLoaded } : item
              )
              const loadable = lines.filter((item) => item.ready)
              return {
                ...event,
                lines,
                loadedCount: loadable.filter((item) => item.loaded).length,
              }
            }),
          }
        : current,
      { revalidate: false }
    )
    try {
      const response = await fetch('/api/logistics/loading', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey, lineKey: line.key, loaded: nextLoaded, quantity: line.quantity }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut actualitzar.'))
      await mutate()
    } catch (toggleError) {
      await mutate(previous, { revalidate: false })
      setActionError(toggleError instanceof Error ? toggleError.message : 'No s’ha pogut actualitzar.')
    } finally {
      setBusyKey('')
    }
  }

  const resolvePending = async (
    eventKey: string,
    line: LogisticsLoadingLine,
    resolution: 'prepared' | 'left_unprepared'
  ) => {
    if (!line.pendingRefs?.length) return
    const rowKey = `${eventKey}::${line.key}`
    setBusyKey(rowKey)
    setActionError('')
    try {
      const response = await fetch('/api/logistics/loading/pending', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs: line.pendingRefs, resolution }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(json.error || 'No s’ha pogut actualitzar el pendent.'))
      await mutate()
    } catch (resolveError) {
      setActionError(resolveError instanceof Error ? resolveError.message : 'No s’ha pogut actualitzar el pendent.')
    } finally {
      setBusyKey('')
    }
  }

  return (
    <RoleGuard allowedRoles={['admin', 'direccio', 'cap', 'treballador']}>
      <main className="space-y-5 p-3 sm:p-5 lg:p-6">
        <ModuleHeader
          icon={<PackageCheck className="h-7 w-7 text-emerald-600" />}
          title="Càrrega de camions"
          subtitle="Checklist agregada per esdeveniment"
          mainHref="/menu/logistica"
        />

        <FiltersBar
          id="logistics-truck-loading-filters"
          filters={filters}
          setFilters={(next) => setFilters((current) => ({ ...current, ...next }))}
          visibleFilters={[]}
          hiddenFilters={[]}
          modeDefault="week"
          modeOptions={['week', 'day', 'month', 'range']}
        />

        {actionError ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.message}</p> : null}
        {isLoading ? (
          <div className="flex min-h-60 items-center justify-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregant esdeveniments…</div>
        ) : events.length ? (
          <section className="space-y-4">
            {events.map((event) => (
              <LoadingEventCard
                key={event.eventKey}
                event={event}
                busyKey={busyKey}
                onToggle={toggleLine}
                onResolvePending={resolvePending}
              />
            ))}
          </section>
        ) : (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500">
            <CheckCircle2 className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-semibold">No hi ha càrregues per aquest període.</p>
            <p className="text-sm">Les fitxes de preparació desades apareixeran aquí.</p>
          </div>
        )}
      </main>
    </RoleGuard>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import useSWR from 'swr'
import { format } from 'date-fns'
import { ca } from 'date-fns/locale'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  Truck,
  Warehouse,
} from 'lucide-react'
import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'
import type {
  LogisticsLoadingEvent,
  LogisticsPreparationDashboardDetail,
} from '@/lib/logistics/logisticsLoading.server'
import { computeLineProgress } from '@/lib/logistics/preparationProgress'
import {
  PREPARATION_WAREHOUSE_CODES,
  PREPARATION_WAREHOUSE_LABELS,
} from '@/lib/logistics/preparationWarehouses'
import { isExpeditionsMonitorUser } from '@/lib/logistics/expeditionsMonitorAccess'
import { normalizeRole } from '@/lib/roles'
import { cn } from '@/lib/utils'

type MonitorView = 'doble' | 'preparacions' | 'carrega'

type LogisticsBoardItem = {
  code?: string
  eventName?: string
  startTime?: string
  vehicles?: Array<{ plate?: string }>
}

type MonitorData = {
  preparations: LogisticsEventPrepRow[]
  details: LogisticsPreparationDashboardDetail[]
  loadingEvents: LogisticsLoadingEvent[]
  logisticsBoard: LogisticsBoardItem[]
  updatedAt: number
}

type PreparationMonitorRow = {
  id: string
  time: string
  code: string
  name: string
  location: string
  pct: number
  status: ReturnType<typeof computeLineProgress>['status']
  warehouses: ReturnType<typeof computeLineProgress>['warehouseMap']
  pendingCount: number
  criticalCount: number
  observations: string[]
}

type LoadingMonitorRow = {
  id: string
  time: string
  code: string
  name: string
  location: string
  plates: string[]
  loadedCount: number
  loadableCount: number
  pendingCount: number
  observations: string[]
  materialSummary: string[]
  hasChecklist: boolean
}

const REFRESH_MS = 30_000
const PAGE_ROTATION_MS = 12_000

function normalizedKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(json.error || fallback)
  return json
}

async function monitorFetcher([, day]: [string, string]): Promise<MonitorData> {
  const range = `start=${encodeURIComponent(day)}&end=${encodeURIComponent(day)}`
  const [preparationsResponse, loadingResponse, boardResponse] = await Promise.all([
    fetch(`/api/logistics?${range}`, { cache: 'no-store' }),
    fetch(`/api/logistics/loading?${range}`, { cache: 'no-store' }),
    fetch(`/api/pissarra/logistica?${range}`, { cache: 'no-store' }),
  ])
  const [preparationsJson, loadingJson, boardJson] = await Promise.all([
    readResponse<{ events?: LogisticsEventPrepRow[] }>(
      preparationsResponse,
      'No s’han pogut carregar les preparacions.'
    ),
    readResponse<{ events?: LogisticsLoadingEvent[] }>(
      loadingResponse,
      'No s’han pogut carregar les càrregues.'
    ),
    readResponse<{ items?: LogisticsBoardItem[] }>(
      boardResponse,
      'No s’han pogut carregar els vehicles.'
    ),
  ])

  const preparations = Array.isArray(preparationsJson.events) ? preparationsJson.events : []
  const rowIds = preparations
    .map((row) => String(row.id || '').trim())
    .filter((id) => id && !id.startsWith('draft_'))
    .slice(0, 250)
  let details: LogisticsPreparationDashboardDetail[] = []
  if (rowIds.length) {
    const detailsResponse = await fetch('/api/logistics/preparation-dashboard-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIds }),
    })
    const detailsJson = await readResponse<{ details?: LogisticsPreparationDashboardDetail[] }>(
      detailsResponse,
      'No s’han pogut carregar els pendents.'
    )
    details = Array.isArray(detailsJson.details) ? detailsJson.details : []
  }

  return {
    preparations,
    details,
    loadingEvents: Array.isArray(loadingJson.events) ? loadingJson.events : [],
    logisticsBoard: Array.isArray(boardJson.items) ? boardJson.items : [],
    updatedAt: Date.now(),
  }
}

function useAutoPage(itemCount: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize))
  const [page, setPage] = useState(0)

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1))
  }, [pageCount])

  useEffect(() => {
    if (pageCount <= 1) return
    const timer = window.setInterval(() => {
      setPage((current) => (current + 1) % pageCount)
    }, PAGE_ROTATION_MS)
    return () => window.clearInterval(timer)
  }, [pageCount])

  return { page, pageCount }
}

function PageIndicator({ page, pageCount }: { page: number; pageCount: number }) {
  if (pageCount <= 1) return null
  return (
    <span className="rounded-full bg-slate-700 px-3 py-1 text-sm font-semibold text-slate-200">
      Pàgina {page + 1} de {pageCount}
    </span>
  )
}

function PreparationCard({ row, expanded }: { row: PreparationMonitorRow; expanded: boolean }) {
  const isCritical = row.criticalCount > 0
  const completed = row.status === 'complete' && row.pendingCount === 0
  const accent = isCritical
    ? 'border-red-500 bg-red-950/45'
    : completed
      ? 'border-emerald-500 bg-emerald-950/35'
      : row.status === 'in_progress'
        ? 'border-sky-500 bg-sky-950/35'
        : 'border-slate-600 bg-slate-900'
  const statusLabel = isCritical
    ? 'Incidència'
    : completed
      ? 'Completa'
      : row.status === 'in_progress'
        ? 'En curs'
        : row.status === 'unscheduled'
          ? 'Sense planificar'
          : 'Sense començar'

  return (
    <article className={cn('rounded-2xl border-l-8 border-y border-r p-4 shadow-lg', accent)}>
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums text-white">{row.time || '--:--'}</div>
          <div className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-300">Preparació</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold uppercase tracking-wide text-emerald-300">
                {row.code || 'Sense codi'}
              </div>
              <h3 className={cn('truncate font-black text-white', expanded ? 'text-3xl' : 'text-2xl')}>
                {row.name || 'Esdeveniment'}
              </h3>
              {row.location ? (
                <div className="mt-1 flex items-center gap-1.5 truncate text-lg text-slate-300">
                  <MapPin className="h-5 w-5 shrink-0" /> {row.location}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-3xl font-black tabular-nums text-white">{row.pct}%</div>
              <div className="text-sm font-bold uppercase text-slate-300">{statusLabel}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {PREPARATION_WAREHOUSE_CODES.map((warehouse) => {
              const done = Boolean(row.warehouses[warehouse]?.at)
              return (
                <div
                  key={warehouse}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-base font-bold',
                    done ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                  )}
                >
                  {done ? <CheckCircle2 className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                  {PREPARATION_WAREHOUSE_LABELS[warehouse]}
                </div>
              )
            })}
          </div>

          {row.pendingCount > 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-400 px-3 py-2 text-lg font-black text-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {row.pendingCount} {row.pendingCount === 1 ? 'article pendent' : 'articles pendents'}
            </div>
          ) : null}
          {expanded && row.observations.length ? (
            <div className="mt-3 space-y-1 rounded-xl border border-amber-400/60 bg-amber-950/55 px-3 py-2 text-base text-amber-100">
              {row.observations.slice(0, 3).map((observation) => (
                <p key={observation}>⚠ {observation}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function LoadingCard({ row, expanded }: { row: LoadingMonitorRow; expanded: boolean }) {
  const completed = row.hasChecklist && row.loadableCount > 0 && row.loadedCount === row.loadableCount
  const inProgress = row.loadedCount > 0 && !completed
  const critical = row.pendingCount > 0
  const accent = critical
    ? 'border-red-500 bg-red-950/45'
    : completed
      ? 'border-emerald-500 bg-emerald-950/35'
      : inProgress
        ? 'border-amber-400 bg-amber-950/35'
        : row.hasChecklist
          ? 'border-sky-500 bg-sky-950/35'
          : 'border-slate-600 bg-slate-900'
  const statusLabel = critical
    ? 'Amb pendents'
    : completed
      ? 'Càrrega completa'
      : inProgress
        ? 'Carregant'
        : row.hasChecklist
          ? 'Pendent de carregar'
          : 'Sense càrrega registrada'

  return (
    <article className={cn('rounded-2xl border-l-8 border-y border-r p-4 shadow-lg', accent)}>
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 text-center">
          <div className="text-3xl font-black tabular-nums text-white">{row.time || '--:--'}</div>
          <div className="mt-1 text-sm font-bold uppercase tracking-wide text-slate-300">Sortida</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-bold uppercase tracking-wide text-sky-300">
                {row.code || 'Sense codi'}
              </div>
              <h3 className={cn('truncate font-black text-white', expanded ? 'text-3xl' : 'text-2xl')}>
                {row.name || 'Esdeveniment'}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-lg text-slate-300">
                {row.location ? <span className="inline-flex items-center gap-1.5"><MapPin className="h-5 w-5" /> {row.location}</span> : null}
                <span className="inline-flex items-center gap-1.5 font-bold text-white">
                  <Truck className="h-5 w-5 text-sky-300" />
                  {row.plates.length ? row.plates.join(' · ') : 'Vehicle no assignat'}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-3xl font-black tabular-nums text-white">
                {row.hasChecklist ? `${row.loadedCount}/${row.loadableCount}` : '—'}
              </div>
              <div className="max-w-44 text-sm font-bold uppercase text-slate-300">{statusLabel}</div>
            </div>
          </div>

          {expanded && row.materialSummary.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {row.materialSummary.slice(0, 6).map((material) => (
                <span key={material} className="rounded-full bg-slate-700 px-3 py-1 text-base font-bold text-slate-100">
                  {material}
                </span>
              ))}
            </div>
          ) : null}

          {row.pendingCount > 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-lg font-black text-white">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {row.pendingCount} {row.pendingCount === 1 ? 'pendent de preparar' : 'pendents de preparar'}
            </div>
          ) : null}

          {row.observations.length ? (
            <div className="mt-3 space-y-1 rounded-xl border border-amber-400/60 bg-amber-950/65 px-3 py-2 text-base font-semibold text-amber-100">
              {row.observations.slice(0, expanded ? 4 : 2).map((observation) => (
                <p key={observation} className={cn(!expanded && 'line-clamp-1')}>⚠ {observation}</p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function MonitorSection({
  title,
  icon,
  count,
  children,
  page,
  pageCount,
}: {
  title: string
  icon: React.ReactNode
  count: number
  children: React.ReactNode
  page: number
  pageCount: number
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950">
      <header className="flex min-h-16 items-center justify-between border-b border-slate-700 bg-slate-900 px-5">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-2xl font-black uppercase tracking-wide text-white">{title}</h2>
          <span className="rounded-full bg-slate-700 px-3 py-1 text-base font-bold text-slate-100">{count}</span>
        </div>
        <PageIndicator page={page} pageCount={pageCount} />
      </header>
      {children}
    </section>
  )
}

function PreparationsPanel({ rows, expanded }: { rows: PreparationMonitorRow[]; expanded: boolean }) {
  const pageSize = expanded ? 6 : 4
  const { page, pageCount } = useAutoPage(rows.length, pageSize)
  const visibleRows = rows.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <MonitorSection
      title="Preparacions"
      icon={<Warehouse className="h-8 w-8 text-emerald-400" />}
      count={rows.length}
      page={page}
      pageCount={pageCount}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {visibleRows.length ? visibleRows.map((row) => (
          <PreparationCard key={row.id} row={row} expanded={expanded} />
        )) : (
          <EmptyState text="No hi ha preparacions previstes per avui." />
        )}
      </div>
    </MonitorSection>
  )
}

function LoadingPanel({ rows, expanded }: { rows: LoadingMonitorRow[]; expanded: boolean }) {
  const pageSize = expanded ? 6 : 4
  const { page, pageCount } = useAutoPage(rows.length, pageSize)
  const visibleRows = rows.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <MonitorSection
      title="Càrrega de camions"
      icon={<Truck className="h-8 w-8 text-sky-400" />}
      count={rows.length}
      page={page}
      pageCount={pageCount}
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {visibleRows.length ? visibleRows.map((row) => (
          <LoadingCard key={row.id} row={row} expanded={expanded} />
        )) : (
          <EmptyState text="No hi ha càrregues previstes per avui." />
        )}
      </div>
    </MonitorSection>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 text-center text-xl text-slate-400">
      <PackageCheck className="mb-3 h-12 w-12 text-slate-600" />
      {text}
    </div>
  )
}

function buildPreparationRows(data: MonitorData): PreparationMonitorRow[] {
  const detailMap = new Map(data.details.map((detail) => [detail.eventRowId, detail]))
  return data.preparations
    .map((row) => {
      const progress = computeLineProgress(row)
      const detail = detailMap.get(row.id)
      const pendingArticles = detail?.warehouses.flatMap((warehouse) => warehouse.pendingArticles) || []
      const observations = [
        String(row.PreparacioObservacions || '').trim(),
        ...(detail?.warehouses.map((warehouse) => String(warehouse.preparationNotes || '').trim()) || []),
      ].filter(Boolean)
      return {
        id: row.id,
        time: String(row.PreparacioHora || row.HoraInici || '').slice(0, 5),
        code: String(row.EventCode || '').trim(),
        name: String(row.PreparacioNomEvent || row.NomEvent || '').trim(),
        location: String(row.Ubicacio || '').trim(),
        pct: progress.pct,
        status: progress.status,
        warehouses: progress.warehouseMap,
        pendingCount: pendingArticles.length,
        criticalCount: pendingArticles.filter((article) => article.loadingResolution === 'left_unprepared').length,
        observations: [...new Set(observations)],
      }
    })
    .sort((left, right) => (left.time || '99:99').localeCompare(right.time || '99:99') || left.name.localeCompare(right.name, 'ca'))
}

function buildLoadingRows(data: MonitorData): LoadingMonitorRow[] {
  const prepByCode = new Map<string, LogisticsEventPrepRow>()
  for (const row of data.preparations) {
    const key = normalizedKey(row.EventCode)
    if (key && !prepByCode.has(key)) prepByCode.set(key, row)
  }
  const boardByCode = new Map<string, LogisticsBoardItem[]>()
  for (const item of data.logisticsBoard) {
    const key = normalizedKey(item.code)
    if (!key) continue
    boardByCode.set(key, [...(boardByCode.get(key) || []), item])
  }
  const representedCodes = new Set<string>()
  const rows: LoadingMonitorRow[] = data.loadingEvents.map((event) => {
    const codeKey = normalizedKey(event.eventCode)
    if (codeKey) representedCodes.add(codeKey)
    const prep = prepByCode.get(codeKey)
    const boardItems = boardByCode.get(codeKey) || []
    const plates = [...new Set(boardItems.flatMap((item) => item.vehicles || []).map((vehicle) => String(vehicle.plate || '').trim()).filter(Boolean))]
    const observations = [
      String(prep?.PreparacioObservacions || '').trim(),
      ...event.preparationNotes.map((note) => {
        const warehouse = PREPARATION_WAREHOUSE_LABELS[note.warehouseCode as keyof typeof PREPARATION_WAREHOUSE_LABELS] || note.warehouseCode
        return `${warehouse}: ${note.notes}`
      }),
    ].filter(Boolean)
    const materialSummary = event.lines
      .filter((line) => line.ready && line.quantity > 0)
      .map((line) => `${line.quantity} ${line.label}`)
    return {
      id: event.eventKey,
      time: String(boardItems.find((item) => item.startTime)?.startTime || event.startKey.slice(11, 16) || prep?.HoraInici || '').slice(0, 5),
      code: event.eventCode,
      name: event.eventName,
      location: event.location,
      plates,
      loadedCount: event.loadedCount,
      loadableCount: event.loadableCount,
      pendingCount: event.pendingPreparationCount,
      observations: [...new Set(observations)],
      materialSummary,
      hasChecklist: event.lines.length > 0,
    }
  })

  for (const prep of data.preparations) {
    const codeKey = normalizedKey(prep.EventCode)
    if (codeKey && representedCodes.has(codeKey)) continue
    const boardItems = boardByCode.get(codeKey) || []
    const plates = [...new Set(boardItems.flatMap((item) => item.vehicles || []).map((vehicle) => String(vehicle.plate || '').trim()).filter(Boolean))]
    rows.push({
      id: `planned:${prep.id}`,
      time: String(boardItems.find((item) => item.startTime)?.startTime || prep.HoraInici || '').slice(0, 5),
      code: prep.EventCode,
      name: prep.PreparacioNomEvent || prep.NomEvent,
      location: prep.Ubicacio,
      plates,
      loadedCount: 0,
      loadableCount: 0,
      pendingCount: 0,
      observations: String(prep.PreparacioObservacions || '').trim() ? [String(prep.PreparacioObservacions).trim()] : [],
      materialSummary: [],
      hasChecklist: false,
    })
  }

  return rows.sort((left, right) => (left.time || '99:99').localeCompare(right.time || '99:99') || left.name.localeCompare(right.name, 'ca'))
}

export default function ExpeditionsMonitorPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const rawView = searchParams?.get('vista')
  const view: MonitorView = rawView === 'preparacions' || rawView === 'carrega' ? rawView : 'doble'
  const [now, setNow] = useState(() => new Date())
  const day = format(now, 'yyyy-MM-dd')
  const userId = session?.user?.id
  const isAuthorized = Boolean(
    userId && (isExpeditionsMonitorUser(userId) || normalizeRole(session?.user?.role) === 'admin')
  )

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (status !== 'loading' && session?.user && !isAuthorized) router.replace('/menu')
  }, [status, session?.user, isAuthorized, router])

  const { data, error, isLoading } = useSWR(
    isAuthorized ? ['expeditions-monitor', day] as [string, string] : null,
    monitorFetcher,
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  )
  const preparationRows = useMemo(() => data ? buildPreparationRows(data) : [], [data])
  const loadingRows = useMemo(() => data ? buildLoadingRows(data) : [], [data])

  if (status === 'loading' || (isAuthorized && isLoading && !data)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-3 text-2xl font-bold text-slate-300">
        <Clock3 className="h-8 w-8 animate-pulse" /> Carregant monitor d’expedicions…
      </div>
    )
  }
  if (!isAuthorized) return null

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-white">
      <header className="flex min-h-20 items-center justify-between border-b border-slate-700 bg-slate-900 px-6 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="rounded-2xl bg-emerald-500/15 p-3"><PackageCheck className="h-9 w-9 text-emerald-400" /></div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-wide">Monitor d’expedicions</h1>
            <p className="text-base font-semibold text-slate-400">
              {view === 'doble' ? 'Preparacions i càrrega' : view === 'preparacions' ? 'Preparacions' : 'Càrrega de camions'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black capitalize">{format(now, "EEEE d 'de' MMMM", { locale: ca })}</div>
          <div className="flex items-center justify-end gap-3 text-lg font-bold text-slate-300">
            <span>{format(now, 'HH:mm')}</span>
            <span className={cn('inline-flex items-center gap-2', error ? 'text-red-400' : 'text-emerald-400')}>
              <span className={cn('h-3 w-3 rounded-full', error ? 'bg-red-500' : 'bg-emerald-400')} />
              {error ? 'Sense actualitzar' : data ? `Actualitzat ${format(new Date(data.updatedAt), 'HH:mm')}` : 'Connectant'}
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="flex items-center justify-center gap-3 bg-red-600 px-5 py-2 text-lg font-black text-white">
          <AlertTriangle className="h-6 w-6" /> Dades possiblement desactualitzades: {error.message}
        </div>
      ) : null}

      <div className={cn('flex min-h-0 flex-1', view === 'doble' ? 'divide-x divide-slate-700' : '')}>
        {view !== 'carrega' ? (
          <div className={cn('flex min-h-0', view === 'doble' ? 'w-[45%]' : 'w-full')}>
            <PreparationsPanel rows={preparationRows} expanded={view === 'preparacions'} />
          </div>
        ) : null}
        {view !== 'preparacions' ? (
          <div className={cn('flex min-h-0', view === 'doble' ? 'w-[55%]' : 'w-full')}>
            <LoadingPanel rows={loadingRows} expanded={view === 'carrega'} />
          </div>
        ) : null}
      </div>
    </main>
  )
}

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { AlertTriangle, LayoutDashboard, ListChecks } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DonutChart } from '@/components/reports/DonutChart'
import {
  canAccessIncidentsModule,
  normalizeIncidentActionStatus,
  normalizeIncidentStatus,
  type IncidentWorkflowStatus,
} from '@/lib/incidentPolicy'
import { INCIDENT_ORIGIN_DEPARTMENTS } from '@/lib/incidentOriginDepartments'
import {
  buildDaySeriesForChart,
  buildIncidentDashboardStats,
  STATUS_ORDER,
  statusLabel,
  type IncidentDashboardRow,
} from '@/lib/incidentDashboardStats'
import {
  buildIncidentActionsDashboardStats,
  incidentActionStatusLabel,
  type BatchActionRow,
} from '@/lib/incidentActionsDashboardStats'
import { formatDateString } from '@/lib/formatDate'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'

function iso(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function thisWeekRange() {
  const now = new Date()
  return {
    from: iso(startOfWeek(now, { weekStartsOn: 1 })),
    to: iso(endOfWeek(now, { weekStartsOn: 1 })),
  }
}


function incidentMatchesSearch(inc: IncidentDashboardRow, q: string) {
  const n = q.trim().toLowerCase()
  if (!n) return true
  const blob = [
    inc.incidentNumber,
    inc.eventTitle,
    inc.eventCode,
    inc.eventDate,
    inc.department,
    inc.category?.label,
  ]
    .map((x) => String(x ?? '').toLowerCase())
    .join(' ')
  return blob.includes(n)
}

export default function IncidentsQuadrePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const user = session?.user as { role?: string; department?: string } | undefined
  const canSee = canAccessIncidentsModule(user || {})

  const { setContent, setOpen } = useFilters()

  const handleDashboardDatesChange = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    setFrom(f.start)
    setTo(f.end)
  }

  const [from, setFrom] = useState(() => thisWeekRange().from)
  const [to, setTo] = useState(() => thisWeekRange().to)
  const [dateResetSignal, setDateResetSignal] = useState(0)

  const [apiDepartment, setApiDepartment] = useState<string | undefined>(undefined)
  const [importance, setImportance] = useState('all')
  const [categoryLabel, setCategoryLabel] = useState('all')
  const [incidentStatus, setIncidentStatus] = useState<'all' | IncidentWorkflowStatus>('all')
  const [incidentSearch, setIncidentSearch] = useState('')
  const [actionStatus, setActionStatus] = useState<'all' | 'open' | 'in_progress' | 'done' | 'cancelled'>(
    'all'
  )
  const [actionDepartment, setActionDepartment] = useState('all')
  const [actionSearch, setActionSearch] = useState('')

  const [categoryCatalog, setCategoryCatalog] = useState<{ id: string; label: string }[]>([])

  const [incidents, setIncidents] = useState<IncidentDashboardRow[]>([])
  const [actions, setActions] = useState<BatchActionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionsError, setActionsError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.replace('/login')
      return
    }
    if (!canSee) {
      router.replace('/menu')
    }
  }, [status, session, router, canSee])

  useEffect(() => {
    if (status === 'loading' || !session || !canSee) return
    let cancel = false
    void (async () => {
      try {
        const res = await fetch('/api/incidents/categories', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || cancel) return
        const raw = Array.isArray(json.categories) ? json.categories : []
        const list = raw
          .filter((c: { active?: boolean }) => c.active !== false)
          .map((c: { id: string; label: string }) => ({
            id: String(c.id),
            label: String(c.label),
          }))
        if (!cancel) setCategoryCatalog(list)
      } catch {
        if (!cancel) setCategoryCatalog([])
      }
    })()
    return () => {
      cancel = true
    }
  }, [status, session, canSee])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionsError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('from', from)
      qs.set('to', to)
      qs.set('limit', '1000')
      qs.set('light', '1')
      if (apiDepartment) qs.set('department', apiDepartment)
      if (importance && importance !== 'all') qs.set('importance', importance)
      if (categoryLabel && categoryLabel !== 'all') qs.set('categoryLabel', categoryLabel)
      const res = await fetch(`/api/incidents?${qs.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || `HTTP ${res.status}`))
      const list = Array.isArray(data.incidents) ? data.incidents : []
      setIncidents(list as IncidentDashboardRow[])

      const ids = [
        ...new Set(
          list
            .map((row: { id?: string }) => String(row.id || '').trim())
            .filter(Boolean)
        ),
      ]
      if (ids.length === 0) {
        setActions([])
        return
      }

      const batchRes = await fetch('/api/incidents/actions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentIds: ids }),
        cache: 'no-store',
      })
      const batchJson = await batchRes.json().catch(() => ({}))
      if (!batchRes.ok) {
        setActionsError(String(batchJson?.error || `Accions: HTTP ${batchRes.status}`))
        setActions([])
        return
      }
      const act = Array.isArray(batchJson.actions) ? batchJson.actions : []
      setActions(act as BatchActionRow[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error de càrrega')
      setIncidents([])
      setActions([])
    } finally {
      setLoading(false)
    }
  }, [from, to, apiDepartment, importance, categoryLabel])

  useEffect(() => {
    if (status === 'loading' || !session || !canSee) return
    load()
  }, [status, session, canSee, load])

  const departmentOptions = useMemo(() => {
    const set = new Set<string>(INCIDENT_ORIGIN_DEPARTMENTS)
    incidents.forEach((i) => {
      const dep = (i.department || '').trim()
      if (dep) set.add(dep)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [incidents])

  const categorySelectOptions = useMemo(() => {
    const byLabel = new Map<string, string>()
    categoryCatalog.forEach((c) => byLabel.set(c.label, c.id))
    incidents.forEach((i) => {
      const label = (i.category?.label || '').trim()
      if (label && !byLabel.has(label)) byLabel.set(label, label)
    })
    return Array.from(byLabel.entries())
      .map(([label]) => ({ id: label, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [categoryCatalog, incidents])

  const visibleIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (incidentStatus !== 'all' && normalizeIncidentStatus(inc.status) !== incidentStatus) {
        return false
      }
      return incidentMatchesSearch(inc, incidentSearch)
    })
  }, [incidents, incidentStatus, incidentSearch])

  const visibleIncidentIds = useMemo(() => {
    return new Set(visibleIncidents.map((i) => String(i.id || '').trim()).filter(Boolean))
  }, [visibleIncidents])

  const stats = useMemo(() => buildIncidentDashboardStats(visibleIncidents), [visibleIncidents])
  const daySeries = useMemo(
    () => buildDaySeriesForChart(stats.dayMap, from, to),
    [stats.dayMap, from, to]
  )

  const incidentMetaList = useMemo(
    () =>
      visibleIncidents
        .map((i) => ({
          id: String(i.id || ''),
          incidentNumber: i.incidentNumber,
          eventTitle: i.eventTitle,
          eventCode: i.eventCode,
          eventDate: i.eventDate,
        }))
        .filter((m) => m.id),
    [visibleIncidents]
  )

  const actionDepartmentOptions = useMemo(() => {
    const set = new Set<string>()
    actions.forEach((a) => {
      const d = (a.department || '').trim()
      if (d) set.add(d)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [actions])

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className={typography('label')}>Departament</label>
          <Select
            value={apiDepartment || 'all'}
            onValueChange={(v) => setApiDepartment(v === 'all' ? undefined : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              {departmentOptions.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Importància</label>
          <Select value={importance} onValueChange={setImportance}>
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Tipologia</label>
          <Select value={categoryLabel} onValueChange={setCategoryLabel}>
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              {categorySelectOptions.map((c) => (
                <SelectItem key={c.id} value={c.label}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Estat (incidència)</label>
          <Select
            value={incidentStatus}
            onValueChange={(v) => setIncidentStatus(v as typeof incidentStatus)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tots" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots</SelectItem>
              <SelectItem value="obert">Obert</SelectItem>
              <SelectItem value="en_curs">En curs</SelectItem>
              <SelectItem value="resolt">Resolt</SelectItem>
              <SelectItem value="tancat">Tancat</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Cerca incidència</label>
          <Input
            value={incidentSearch}
            onChange={(e) => setIncidentSearch(e.target.value)}
            placeholder="Núm., codi, esdeveniment…"
          />
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-3">
          <p className={`${typography('label')} text-slate-700`}>Accions derivades</p>

          <div className="space-y-2">
            <label className={typography('label')}>Estat de l’acció</label>
            <Select
              value={actionStatus}
              onValueChange={(v) => setActionStatus(v as typeof actionStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Totes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Totes</SelectItem>
                <SelectItem value="open">Oberta</SelectItem>
                <SelectItem value="in_progress">En curs</SelectItem>
                <SelectItem value="done">Feta</SelectItem>
                <SelectItem value="cancelled">Cancel·lada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className={typography('label')}>Departament (acció)</label>
            <Select value={actionDepartment} onValueChange={setActionDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="Tots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tots</SelectItem>
                {actionDepartmentOptions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className={typography('label')}>Cerca acció</label>
            <Input
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              placeholder="Títol o assignat"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <ResetFilterButton
            onClick={() => {
              const w = thisWeekRange()
              setFrom(w.from)
              setTo(w.to)
              setDateResetSignal((n) => n + 1)
              setApiDepartment(undefined)
              setImportance('all')
              setCategoryLabel('all')
              setIncidentStatus('all')
              setIncidentSearch('')
              setActionStatus('all')
              setActionDepartment('all')
              setActionSearch('')
            }}
          />
          <button
            type="button"
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            Tancar
          </button>
        </div>
      </div>
    )
  }

  const filteredActions = useMemo(() => {
    const q = actionSearch.trim().toLowerCase()
    return actions.filter((a) => {
      if (!visibleIncidentIds.has(String(a.incidentId || '').trim())) return false
      if (actionStatus !== 'all' && normalizeIncidentActionStatus(a.status) !== actionStatus) {
        return false
      }
      if (actionDepartment !== 'all') {
        const dep = (a.department || '').trim()
        if (dep !== actionDepartment) return false
      }
      if (q) {
        const blob = `${a.title || ''} ${a.assignedToName || ''}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [actions, visibleIncidentIds, actionStatus, actionDepartment, actionSearch])

  const actionStats = useMemo(
    () => buildIncidentActionsDashboardStats(filteredActions, incidentMetaList),
    [filteredActions, incidentMetaList]
  )

  const loadedCount = incidents.length
  const hasClientIncidentFilters =
    incidentStatus !== 'all' || incidentSearch.trim().length > 0
  const hasActionFilters =
    actionStatus !== 'all' || actionDepartment !== 'all' || actionSearch.trim().length > 0
  const hasServerFilters =
    Boolean(apiDepartment) || importance !== 'all' || categoryLabel !== 'all'

  const actionsForVisibleIncidents = useMemo(
    () =>
      actions.filter((a) => visibleIncidentIds.has(String(a.incidentId || '').trim())),
    [actions, visibleIncidentIds]
  )

  const periodLabel = `${formatDateString(from) ?? from} – ${formatDateString(to) ?? to}`

  const deptHeight = Math.min(420, 48 + stats.deptChart.length * 32)
  const catHeight = Math.min(480, 48 + stats.catChart.length * 28)
  const actionDeptHeight = Math.min(420, 48 + actionStats.deptChart.length * 32)

  if (status === 'loading' || (session && !canSee)) {
    return <p className={cn('text-center py-16', typography('bodySm'))}>Carregant…</p>
  }

  return (
    <div className="p-4 flex flex-col gap-4 w-full max-w-none">
      <ModuleHeader
        icon={<AlertTriangle className="w-7 h-7 text-yellow-600" />}
        title="Quadre de comandament"
        subtitle="Indicadors segons data d’esdeveniment (mateix criteri que el tauler setmanal)"
        mainHref="/menu/incidents"
        actions={
          <Link
            href="/menu/incidents"
            className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
          >
            Tauler de treball
          </Link>
        }
      />

      {/* Barra compacta: dates (SmartFilters) + botó filtres — mateix patró que Incidències / Modificacions */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm mb-2 flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <SmartFilters
          modeDefault="week"
          modeOptions={['week', 'month', 'year', 'range']}
          role="Direcció"
          onChange={handleDashboardDatesChange}
          showDepartment={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          showImportance={false}
          showAdvanced={false}
          compact
          initialStart={from}
          initialEnd={to}
          resetSignal={dateResetSignal}
        />
        <div className="flex-1 min-w-[8px]" />
        <FilterButton onClick={openFiltersPanel} />
      </div>

      <div className={`px-1 flex flex-col gap-1 ${typography('bodySm')}`}>
        <p>
          <LayoutDashboard className="inline h-4 w-4 mr-1 align-text-bottom text-slate-500" aria-hidden />
          {periodLabel}
          {loading
            ? ' · Carregant…'
            : ` · ${stats.total} incidències${
                loadedCount !== stats.total ? ` (${loadedCount} carregades)` : ''
              } · ${actionStats.total} accions${
                actionsForVisibleIncidents.length !== actionStats.total
                  ? ` (${actionsForVisibleIncidents.length} en incidències visibles)`
                  : ''
              } · màx. 1000 incidències per consulta`}
        </p>
        {!loading &&
        (hasServerFilters ||
          hasClientIncidentFilters ||
          hasActionFilters ||
          loadedCount !== stats.total ||
          actionsForVisibleIncidents.length !== actionStats.total) ? (
          <p className={cn(typography('bodyXs'), 'text-slate-500')}>
            KPIs i gràfics mostren només el subconjunt que compleix els filtres actius (incidències i accions).
          </p>
        ) : null}
        {error ? <p className={cn(typography('bodySm'), 'text-red-600')}>{error}</p> : null}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={stats.total} tone="slate" />
        {STATUS_ORDER.map((k) => (
          <KpiCard
            key={k}
            label={statusLabel[k]}
            value={stats.byStatus[k]}
            tone={
              k === 'obert'
                ? 'amber'
                : k === 'en_curs'
                  ? 'blue'
                  : k === 'resolt'
                    ? 'emerald'
                    : 'zinc'
            }
          />
        ))}
        <KpiCard label="Urgent / Alta" value={stats.highPriority} tone="rose" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className={`${typography('sectionTitle')} mb-2`}>Distribució per estat</h2>
          {stats.statusChart.length === 0 ? (
            <p className={typography('bodySm')}>Sense dades en aquest període.</p>
          ) : (
            <DonutChart data={stats.statusChart} />
          )}
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className={`${typography('sectionTitle')} mb-2`}>Incidències per dia</h2>
          {daySeries.length === 0 ? (
            <p className={typography('bodySm')}>Període no vàlid o sense dades.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} width={36} />
                <Tooltip />
                <Bar dataKey="value" fill="#0ea5e9" name="Incidències" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className={`${typography('sectionTitle')} mb-2`}>Per departament</h2>
        {stats.deptChart.length === 0 ? (
          <p className={typography('bodySm')}>Sense dades.</p>
        ) : (
          <ResponsiveContainer width="100%" height={deptHeight}>
            <BarChart
              layout="vertical"
              data={stats.deptChart}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#64748b" name="Incidències" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className={`${typography('sectionTitle')} mb-2`}>Per tipologia (categoria)</h2>
        {stats.catChart.length === 0 ? (
          <p className={typography('bodySm')}>Sense dades.</p>
        ) : (
          <ResponsiveContainer width="100%" height={catHeight}>
            <BarChart
              layout="vertical"
              data={stats.catChart}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" fill="#a855f7" name="Incidències" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Accions derivades (mateix període que les incidències del conjunt carregat) */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm space-y-4">
        <div>
          <h2 className={cn(typography('sectionTitle'), 'flex items-center gap-2 text-violet-950')}>
            <ListChecks className="h-5 w-5 text-violet-700 shrink-0" aria-hidden />
            Accions derivades
          </h2>
          <p className={cn(typography('bodyXs'), 'mt-1.5 text-slate-600 max-w-3xl')}>
            Tasques vinculades a les incidències del període; els filtres d’accions (i els d’incidència) recalculen
            aquests indicadors i la taula de detall.
          </p>
          {actionsError ? (
            <p className={cn(typography('bodySm'), 'text-red-600 mt-2')}>{actionsError}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total accions" value={actionStats.total} tone="slate" />
          {actionStats.actionStatusOrder.map((k) => (
            <KpiCard
              key={k}
              label={incidentActionStatusLabel[k]}
              value={actionStats.byStatus[k]}
              tone={
                k === 'open'
                  ? 'amber'
                  : k === 'in_progress'
                    ? 'blue'
                    : k === 'done'
                      ? 'emerald'
                      : 'zinc'
              }
            />
          ))}
          <KpiCard label="Vençudes" value={actionStats.overdue} tone="rose" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className={`${typography('sectionTitle')} mb-2`}>Accions per estat</h3>
            {actionStats.statusChart.length === 0 ? (
              <p className={typography('bodySm')}>Cap acció en aquest període.</p>
            ) : (
              <DonutChart data={actionStats.statusChart} />
            )}
          </section>
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className={`${typography('sectionTitle')} mb-2`}>Accions per departament (acció)</h3>
            {actionStats.deptChart.length === 0 ? (
              <p className={typography('bodySm')}>Sense dades.</p>
            ) : (
              <ResponsiveContainer width="100%" height={actionDeptHeight}>
                <BarChart
                  layout="vertical"
                  data={actionStats.deptChart}
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-slate-200" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#7c3aed" name="Accions" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </section>
        </div>

        <section className="rounded-xl border bg-white p-4 shadow-sm overflow-hidden">
          <h3 className={`${typography('sectionTitle')} mb-2`}>Detall d’accions</h3>
          {actionStats.total === 0 && !actionsError ? (
            <p className={typography('bodySm')}>Cap acció derivada en les incidències d’aquest període.</p>
          ) : (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto max-h-[min(480px,50vh)] overflow-y-auto">
                <table className={cn('w-full min-w-[880px]', typography('bodySm'))}>
                  <thead className="sticky top-0 bg-slate-100 z-[1] border-b border-slate-200">
                    <tr>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Incidència</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Acció</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Estat</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Dept</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Assignat</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Termini</th>
                      <th className={cn('p-2 text-left font-semibold', typography('bodySm'))}>Creada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionStats.tableRows.map((row) => (
                      <tr key={row.actionId} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="p-2 text-slate-800 align-top max-w-[220px]">{row.incidentLabel}</td>
                        <td className="p-2 align-top max-w-[260px]">
                          <span className="font-medium text-slate-900">{row.title}</span>
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              row.status === 'open' && 'bg-amber-100 text-amber-900',
                              row.status === 'in_progress' && 'bg-blue-100 text-blue-900',
                              row.status === 'done' && 'bg-emerald-100 text-emerald-900',
                              row.status === 'cancelled' && 'bg-slate-200 text-slate-700'
                            )}
                          >
                            {row.statusLabel}
                          </span>
                        </td>
                        <td className="p-2 align-top">{row.department}</td>
                        <td className="p-2 align-top">{row.assignedToName}</td>
                        <td
                          className={cn(
                            'p-2 align-top whitespace-nowrap',
                            row.isOverdue && 'text-red-700 font-semibold'
                          )}
                        >
                          {row.dueAtShort}
                        </td>
                        <td className="p-2 align-top whitespace-nowrap text-slate-600">
                          {row.createdAtShort}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'slate' | 'amber' | 'blue' | 'emerald' | 'zinc' | 'rose'
}) {
  const ring: Record<typeof tone, string> = {
    slate: 'border-slate-200 bg-slate-50',
    amber: 'border-amber-200 bg-amber-50',
    blue: 'border-blue-200 bg-blue-50',
    emerald: 'border-emerald-200 bg-emerald-50',
    zinc: 'border-zinc-200 bg-zinc-50',
    rose: 'border-rose-200 bg-rose-50',
  }
  return (
    <div className={`rounded-xl border px-3 py-3 ${ring[tone]}`}>
      <p className={`${typography('label')} mb-1`}>{label}</p>
      <p className={cn(typography('kpiValue'), 'tabular-nums')}>{value}</p>
    </div>
  )
}

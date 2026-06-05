'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { AlertTriangle, LayoutDashboard, ListChecks } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import FilterButton from '@/components/ui/filter-button'
import IncidentsLnFilterBadges from '../components/IncidentsLnFilterBadges'
import { incidentMatchesLnFilter } from '@/lib/incidentLn'
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
import {
  normalizeIncidentActionStatus,
  normalizeIncidentStatus,
  type IncidentWorkflowStatus,
} from '@/lib/incidentPolicy'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import { INCIDENTS_QUADRE_PATH, INCIDENTS_UI_PATH } from '@/lib/incidentsPermissions'
import { normalizeDept } from '@/lib/accessControl'
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

const IncidentsQuadreCharts = dynamic(
  () => import('./IncidentsQuadreCharts'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
        Carregant gràfics…
      </div>
    ),
  }
)

function iso(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

const MARKETING_DEFAULT_CATEGORY_FILTER = '9XX'
const MARKETING_DEPARTMENTS = new Set(['marqueting', 'marketing'])

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
  const { ready: uiPermsReady, canViewPath } = useUiPermissions()
  const canSeeQuadre = uiPermsReady && canViewPath(INCIDENTS_QUADRE_PATH)
  const canSeeBoard = uiPermsReady && canViewPath(INCIDENTS_UI_PATH)
  const isMarketingUser = MARKETING_DEPARTMENTS.has(
    normalizeDept((session?.user as { department?: string } | undefined)?.department || '')
  )

  const { setContent, setOpen } = useFilters()

  const handleDashboardDatesChange = (f: SmartFiltersChange) => {
    if (!f.start || !f.end) return
    setFrom(f.start)
    setTo(f.end)
  }

  const [from, setFrom] = useState(() => thisWeekRange().from)
  const [to, setTo] = useState(() => thisWeekRange().to)
  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [marketingDefaultSuppressed, setMarketingDefaultSuppressed] = useState(false)

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
  const [lnFilter, setLnFilter] = useState('all')

  const [incidents, setIncidents] = useState<IncidentDashboardRow[]>([])
  const [actions, setActions] = useState<BatchActionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionsError, setActionsError] = useState<string | null>(null)

  const effectiveCategoryLabel =
    isMarketingUser && !marketingDefaultSuppressed && categoryLabel === 'all'
      ? MARKETING_DEFAULT_CATEGORY_FILTER
      : categoryLabel

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.replace('/login')
      return
    }
    if (uiPermsReady && !canSeeQuadre) {
      router.replace('/menu')
    }
  }, [status, session, router, uiPermsReady, canSeeQuadre])

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
      if (effectiveCategoryLabel && effectiveCategoryLabel !== 'all') {
        if (/^\d+$/.test(effectiveCategoryLabel)) qs.set('categoryId', effectiveCategoryLabel)
        else qs.set('categoryLabel', effectiveCategoryLabel)
      }
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
  }, [from, to, apiDepartment, importance, effectiveCategoryLabel])

  useEffect(() => {
    if (status === 'loading' || !session || !uiPermsReady || !canSeeQuadre) return
    load()
  }, [status, session, uiPermsReady, canSeeQuadre, load])

  const departmentOptions = useMemo(() => {
    const set = new Set<string>(INCIDENT_ORIGIN_DEPARTMENTS)
    incidents.forEach((i) => {
      const dep = (i.department || '').trim()
      if (dep) set.add(dep)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [incidents])

  const categorySelectOptions = useMemo(() => {
    const byId = new Map<string, string>()
    incidents.forEach((i) => {
      const id = (i.category?.id || '').trim()
      const label = (i.category?.label || '').trim()
      if (id && label && !byId.has(id)) byId.set(id, label)
    })
    let items = Array.from(byId.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
    if (isMarketingUser && effectiveCategoryLabel === MARKETING_DEFAULT_CATEGORY_FILTER) {
      items = items.filter((item) => item.id.startsWith('9'))
    }
    return items
  }, [effectiveCategoryLabel, incidents, isMarketingUser])

  const categorySelectValue =
    effectiveCategoryLabel === MARKETING_DEFAULT_CATEGORY_FILTER ? 'all' : effectiveCategoryLabel

  const visibleIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (!incidentMatchesLnFilter(inc.ln, lnFilter)) {
        return false
      }
      if (incidentStatus !== 'all' && normalizeIncidentStatus(inc.status) !== incidentStatus) {
        return false
      }
      return incidentMatchesSearch(inc, incidentSearch)
    })
  }, [incidents, lnFilter, incidentStatus, incidentSearch])

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
          <Select
            value={categorySelectValue}
            onValueChange={(v) => {
              if (v === 'all') {
                setMarketingDefaultSuppressed(true)
                setCategoryLabel('all')
                return
              }
              setMarketingDefaultSuppressed(true)
              setCategoryLabel(v)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Totes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Totes</SelectItem>
              {categorySelectOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
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
              setMarketingDefaultSuppressed(true)
              setApiDepartment(undefined)
              setImportance('all')
              setCategoryLabel('all')
              setIncidentStatus('all')
              setIncidentSearch('')
              setActionStatus('all')
              setActionDepartment('all')
              setActionSearch('')
              setLnFilter('all')
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
    lnFilter !== 'all' || incidentStatus !== 'all' || incidentSearch.trim().length > 0
  const hasActionFilters =
    actionStatus !== 'all' || actionDepartment !== 'all' || actionSearch.trim().length > 0
  const hasServerFilters =
    Boolean(apiDepartment) || importance !== 'all' || effectiveCategoryLabel !== 'all'

  const actionsForVisibleIncidents = useMemo(
    () =>
      actions.filter((a) => visibleIncidentIds.has(String(a.incidentId || '').trim())),
    [actions, visibleIncidentIds]
  )

  const periodLabel = `${formatDateString(from) ?? from} – ${formatDateString(to) ?? to}`

  const deptHeight = Math.min(420, 48 + stats.deptChart.length * 32)
  const catHeight = Math.min(480, 48 + stats.catChart.length * 28)
  const actionDeptHeight = Math.min(420, 48 + actionStats.deptChart.length * 32)

  if (status === 'loading' || !uiPermsReady || (session && !canSeeQuadre)) {
    return <p className={cn('text-center py-16', typography('bodySm'))}>Carregant…</p>
  }

  return (
    <div className="p-4 flex flex-col gap-4 w-full max-w-none">
      <ModuleHeader
        icon={<AlertTriangle className="w-7 h-7 text-yellow-600" />}
        title="Quadre de comandament"
        subtitle="Indicadors segons data d’esdeveniment (mateix criteri que el tauler setmanal)"
        mainHref={canSeeBoard ? INCIDENTS_UI_PATH : undefined}
        actions={
          canSeeBoard ? (
            <Link
              href={INCIDENTS_UI_PATH}
              className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
            >
              Tauler de treball
            </Link>
          ) : null
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
        <IncidentsLnFilterBadges value={lnFilter} onChange={setLnFilter} />
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

      <IncidentsQuadreCharts
        mode="incidents"
        stats={stats}
        daySeries={daySeries}
        deptHeight={deptHeight}
        catHeight={catHeight}
      />

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

        <IncidentsQuadreCharts
          mode="actions"
          actionStats={actionStats}
          actionDeptHeight={actionDeptHeight}
        />

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

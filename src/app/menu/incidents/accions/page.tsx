'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { endOfWeek, format, startOfWeek } from 'date-fns'
import { AlertTriangle, ExternalLink, ListChecks, Search } from 'lucide-react'
import ModuleHeader from '@/components/layout/ModuleHeader'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useUiPermissions } from '@/hooks/useUiPermissions'
import {
  INCIDENTS_COMMAND_BOARD_PERM,
  INCIDENTS_QUADRE_PATH,
  INCIDENTS_UI_PATH,
} from '@/lib/incidentsPermissions'
import { incidentActionStatusLabel } from '@/lib/incidentActionsDashboardStats'
import {
  buildIncidentActionMineLabel,
  type IncidentActionMineRow,
} from '@/lib/incidentActionsMine'
import { formatDateString } from '@/lib/formatDate'
import { typography } from '@/lib/typography'
import { cn } from '@/lib/utils'
import IncidentNotificationsBell from '../components/IncidentNotificationsBell'
import SmartFilters, { type SmartFiltersChange } from '@/components/filters/SmartFilters'
import { CorporateFiltersShell } from '@/components/layout/corporate-filters'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'

type StatusFilter = 'pending' | 'all' | 'open' | 'in_progress' | 'done' | 'cancelled'

function shortDate(iso: string) {
  if (!iso) return '-'
  return formatDateString(iso) ?? iso.slice(0, 10)
}

function incidentBoardHref(incidentId: string) {
  const qs = new URLSearchParams({
    incidentId,
    ops: '1',
    dateMode: 'all',
  })
  return `${INCIDENTS_UI_PATH}?${qs.toString()}`
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'slate' | 'amber' | 'rose'
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-950'
      : tone === 'rose'
        ? 'border-rose-200 bg-rose-50 text-rose-950'
        : 'border-slate-200 bg-slate-50 text-slate-900'

  return (
    <div className={cn('rounded-xl border px-4 py-3 shadow-sm', toneClass)}>
      <p className={cn(typography('label'), 'text-current/70')}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function actionFilterDate(row: IncidentActionMineRow) {
  return String(row.incident?.eventDate || row.createdAt || '').slice(0, 10)
}

function isWithinDateRange(dateIso: string, from?: string, to?: string) {
  if (!dateIso) return true
  if (from && dateIso < from) return false
  if (to && dateIso > to) return false
  return true
}

export default function IncidentActionsMinePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { ready: uiPermsReady, canViewPath, hasAction } = useUiPermissions()
  const { setContent, setOpen } = useFilters()
  const canSeeBoard = uiPermsReady && canViewPath(INCIDENTS_UI_PATH)
  const canSeeQuadre = uiPermsReady && hasAction(INCIDENTS_COMMAND_BOARD_PERM)
  const canSeeAccions = canSeeBoard || canSeeQuadre

  const weekStart = useMemo(
    () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    []
  )
  const weekEnd = useMemo(
    () => format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    []
  )

  const [dateResetSignal, setDateResetSignal] = useState(0)
  const [dateFilters, setDateFilters] = useState({
    from: weekStart,
    to: weekEnd,
  })
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [actions, setActions] = useState<IncidentActionMineRow[]>([])
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [pendingCount, setPendingCount] = useState(0)
  const [overdueCount, setOverdueCount] = useState(0)
  const [totalAssigned, setTotalAssigned] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.replace('/login')
      return
    }
    if (uiPermsReady && !canSeeAccions) {
      router.replace('/menu')
    }
  }, [status, session, router, uiPermsReady, canSeeAccions])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      qs.set('status', statusFilter)
      if (search.trim()) qs.set('q', search.trim())
      if (overdueOnly) qs.set('overdue', '1')

      const res = await fetch(`/api/incidents/actions/mine?${qs.toString()}`, {
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(data?.error || `HTTP ${res.status}`))

      setActions(Array.isArray(data.actions) ? data.actions : [])
      setScope(data.scope === 'all' ? 'all' : 'mine')
      setPendingCount(Number(data.pendingCount || 0))
      setOverdueCount(Number(data.overdueCount || 0))
      setTotalAssigned(Number(data.totalAssigned || 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de carrega')
      setActions([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, overdueOnly])

  useEffect(() => {
    if (status === 'loading' || !session || !uiPermsReady || !canSeeAccions) return
    const timer = window.setTimeout(() => {
      void load()
    }, search.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [status, session, uiPermsReady, canSeeAccions, load, search])

  const handleDateFiltersChange = useCallback((f: SmartFiltersChange) => {
    setDateFilters((prev) => {
      const nextFrom = f.start || weekStart
      const nextTo = f.end || weekEnd
      if (prev.from === nextFrom && prev.to === nextTo) return prev
      return { from: nextFrom, to: nextTo }
    })
  }, [weekEnd, weekStart])

  const filteredActions = useMemo(
    () =>
      actions.filter((row) =>
        isWithinDateRange(actionFilterDate(row), dateFilters.from, dateFilters.to)
      ),
    [actions, dateFilters.from, dateFilters.to]
  )

  const filteredPendingCount = useMemo(
    () => filteredActions.filter((row) => row.status === 'open' || row.status === 'in_progress').length,
    [filteredActions]
  )

  const filteredOverdueCount = useMemo(
    () =>
      filteredActions.filter((row) => {
        if (row.status !== 'open' && row.status !== 'in_progress') return false
        return Boolean(row.dueAt) && Date.parse(row.dueAt.slice(0, 10)) < new Date(new Date().toDateString()).getTime()
      }).length,
    [filteredActions]
  )

  const tableRows = useMemo(
    () =>
      filteredActions.map((row) => {
        const st = row.status
        const dueShort = row.dueAt ? shortDate(row.dueAt) : '-'
        const isOverdue =
          (st === 'open' || st === 'in_progress') &&
          row.dueAt &&
          Date.parse(row.dueAt.slice(0, 10)) < new Date(new Date().toDateString()).getTime()

        return {
          ...row,
          incidentLabel: buildIncidentActionMineLabel(row),
          statusLabel: incidentActionStatusLabel[st],
          dueShort,
          createdShort: row.createdAt ? shortDate(row.createdAt) : '-',
          isOverdue,
        }
      }),
    [filteredActions]
  )

  const openFiltersPanel = useCallback(() => {
    setContent(
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <label className={typography('label')} htmlFor="incident-actions-search-panel">
            Cerca
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="incident-actions-search-panel"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Titol, incidencia, esdeveniment..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className={typography('label')}>Estat</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendents (obertes + en curs)</SelectItem>
              <SelectItem value="open">Obertes</SelectItem>
              <SelectItem value="in_progress">En curs</SelectItem>
              <SelectItem value="done">Fetes</SelectItem>
              <SelectItem value="cancelled">Cancel.lades</SelectItem>
              <SelectItem value="all">Totes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <Button
            type="button"
            variant={overdueOnly ? 'default' : 'outline'}
            onClick={() => setOverdueOnly((v) => !v)}
          >
            Nomes vencudes
          </Button>
          <ResetFilterButton
            onClick={() => {
              setSearch('')
              setStatusFilter('pending')
              setOverdueOnly(false)
              setDateFilters({ from: weekStart, to: weekEnd })
              setDateResetSignal((value) => value + 1)
              setOpen(false)
            }}
          />
        </div>
      </div>
    )
    setOpen(true)
  }, [overdueOnly, search, setContent, setOpen, statusFilter, weekEnd, weekStart])

  if (status === 'loading' || !uiPermsReady || (session && !canSeeAccions)) {
    return <p className={cn('py-16 text-center', typography('bodySm'))}>Carregant...</p>
  }

  return (
    <div className="flex w-full max-w-none flex-col gap-4 p-4">
      <ModuleHeader
        icon={<ListChecks className="h-7 w-7 text-violet-600" />}
        title={scope === 'all' ? "Accions d'incidencies" : 'Les meves accions'}
        subtitle={
          scope === 'all'
            ? "Vista global d'accions d'incidencies"
            : "Accions d'incidencies assignades a tu"
        }
        mainHref={canSeeBoard ? INCIDENTS_UI_PATH : undefined}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <IncidentNotificationsBell />
            {canSeeBoard ? (
              <Link
                href={INCIDENTS_UI_PATH}
                className={cn(typography('bodyMd'), 'whitespace-nowrap font-medium hover:underline')}
              >
                Tauler setmanal
              </Link>
            ) : null}
            {canSeeQuadre ? (
              <Link
                href={INCIDENTS_QUADRE_PATH}
                className={cn(typography('bodyMd'), 'whitespace-nowrap font-medium hover:underline')}
              >
                Quadre de comandament
              </Link>
            ) : null}
          </div>
        }
      />

      <CorporateFiltersShell variant="toolbar" className="mb-2">
        <SmartFilters
          modeDefault="week"
          modeOptions={['week', 'month', 'year', 'range']}
          role="Direcció"
          onChange={handleDateFiltersChange}
          showDepartment={false}
          showCommercial={false}
          showWorker={false}
          showLocation={false}
          showStatus={false}
          showImportance={false}
          showAdvanced={false}
          compact
          initialStart={dateFilters.from}
          initialEnd={dateFilters.to}
          resetSignal={dateResetSignal}
        />
        <div className="min-w-[8px] flex-1" />
        <FilterButton onClick={openFiltersPanel} />
      </CorporateFiltersShell>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Pendents" value={filteredPendingCount} tone="amber" />
        <KpiCard label="Vencudes" value={filteredOverdueCount} tone="rose" />
        <KpiCard label="Total assignades" value={tableRows.length} tone="slate" />
      </div>

      {loading ? (
        <p className={cn('py-10 text-center', typography('bodySm'))}>Carregant accions...</p>
      ) : error ? (
        <p className={cn('py-10 text-center text-red-600', typography('bodySm'))}>{error}</p>
      ) : tableRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden />
          <p className={cn(typography('bodyMd'), 'font-medium text-slate-800')}>Cap accio trobada</p>
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-600')}>
            {statusFilter === 'pending' && !search.trim() && !overdueOnly
              ? scope === 'all'
                ? 'No hi ha accions pendents.'
                : 'No tens accions pendents assignades.'
              : 'Prova d ajustar els filtres o la cerca.'}
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border bg-white p-4 shadow-sm">
          <h2 className={cn(typography('sectionTitle'), 'mb-3')}>
            {tableRows.length} accio{tableRows.length === 1 ? '' : 'ns'}
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[920px]', typography('bodySm'))}>
                <thead className="border-b border-slate-200 bg-slate-100">
                  <tr>
                    <th className="p-2 text-left font-semibold">Accio</th>
                    <th className="p-2 text-left font-semibold">Incidencia</th>
                    <th className="p-2 text-left font-semibold">Estat</th>
                    <th className="p-2 text-left font-semibold">Dept</th>
                    <th className="p-2 text-left font-semibold">Termini</th>
                    <th className="p-2 text-left font-semibold">Creada</th>
                    <th className="p-2 text-left font-semibold">Assignada a</th>
                    <th className="p-2 text-left font-semibold">Obrir</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="max-w-[280px] p-2 align-top">
                        <span className="font-medium text-slate-900">{row.title || '-'}</span>
                      </td>
                      <td className="max-w-[240px] p-2 align-top text-slate-800">{row.incidentLabel}</td>
                      <td className="whitespace-nowrap p-2 align-top">
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
                      <td className="p-2 align-top">{(row.department || '').trim() || '-'}</td>
                      <td
                        className={cn(
                          'whitespace-nowrap p-2 align-top',
                          row.isOverdue && 'font-semibold text-red-700'
                        )}
                      >
                        {row.dueShort}
                      </td>
                      <td className="whitespace-nowrap p-2 align-top text-slate-600">
                        {row.createdShort}
                      </td>
                      <td className="p-2 align-top">{row.assignedToName || '-'}</td>
                      <td className="p-2 align-top">
                        <Link
                          href={incidentBoardHref(row.incidentId)}
                          className={cn(
                            typography('bodySm'),
                            'inline-flex items-center gap-1 font-medium text-violet-700 hover:underline'
                          )}
                        >
                          Veure incidencia
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

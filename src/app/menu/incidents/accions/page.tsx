'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
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

type StatusFilter = 'pending' | 'all' | 'open' | 'in_progress' | 'done' | 'cancelled'

function shortDate(iso: string) {
  if (!iso) return '—'
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

export default function IncidentActionsMinePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { ready: uiPermsReady, canViewPath, hasAction } = useUiPermissions()
  const canSeeBoard = uiPermsReady && canViewPath(INCIDENTS_UI_PATH)
  const canSeeQuadre = uiPermsReady && hasAction(INCIDENTS_COMMAND_BOARD_PERM)
  const canSeeAccions = canSeeBoard || canSeeQuadre

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [actions, setActions] = useState<IncidentActionMineRow[]>([])
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
      setPendingCount(Number(data.pendingCount || 0))
      setOverdueCount(Number(data.overdueCount || 0))
      setTotalAssigned(Number(data.totalAssigned || 0))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de càrrega')
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
  }, [status, session, uiPermsReady, canSeeBoard, load, search])

  const tableRows = useMemo(
    () =>
      actions.map((row) => {
        const st = row.status
        const dueShort = row.dueAt ? shortDate(row.dueAt) : '—'
        const isOverdue =
          (st === 'open' || st === 'in_progress') &&
          row.dueAt &&
          Date.parse(row.dueAt.slice(0, 10)) < new Date(new Date().toDateString()).getTime()

        return {
          ...row,
          incidentLabel: buildIncidentActionMineLabel(row),
          statusLabel: incidentActionStatusLabel[st],
          dueShort,
          createdShort: row.createdAt ? shortDate(row.createdAt) : '—',
          isOverdue,
        }
      }),
    [actions]
  )

  if (status === 'loading' || !uiPermsReady || (session && !canSeeAccions)) {
    return <p className={cn('text-center py-16', typography('bodySm'))}>Carregant…</p>
  }

  return (
    <div className="p-4 flex flex-col gap-4 w-full max-w-none">
      <ModuleHeader
        icon={<ListChecks className="w-7 h-7 text-violet-600" />}
        title="Les meves accions"
        subtitle="Accions d'incidències assignades a tu"
        mainHref={canSeeBoard ? INCIDENTS_UI_PATH : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <IncidentNotificationsBell />
            {canSeeBoard ? (
              <Link
                href={INCIDENTS_UI_PATH}
                className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
              >
                Tauler setmanal
              </Link>
            ) : null}
            {canSeeQuadre ? (
              <Link
                href={INCIDENTS_QUADRE_PATH}
                className={cn(typography('bodyMd'), 'font-medium hover:underline whitespace-nowrap')}
              >
                Quadre de comandament
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Pendents" value={pendingCount} tone="amber" />
        <KpiCard label="Vençudes" value={overdueCount} tone="rose" />
        <KpiCard label="Total assignades" value={totalAssigned} tone="slate" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1 space-y-2">
            <label className={typography('label')} htmlFor="mine-action-search">
              Cerca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="mine-action-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Títol, incidència, esdeveniment…"
                className="pl-9"
              />
            </div>
          </div>

          <div className="w-full space-y-2 lg:w-52">
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
                <SelectItem value="cancelled">Cancel·lades</SelectItem>
                <SelectItem value="all">Totes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant={overdueOnly ? 'default' : 'outline'}
              onClick={() => setOverdueOnly((v) => !v)}
              className="whitespace-nowrap"
            >
              Només vençudes
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={cn('text-center py-10', typography('bodySm'))}>Carregant accions…</p>
      ) : error ? (
        <p className={cn('text-center py-10', typography('bodySm'), 'text-red-600')}>{error}</p>
      ) : tableRows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-10 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-slate-400" aria-hidden />
          <p className={cn(typography('bodyMd'), 'font-medium text-slate-800')}>
            Cap acció trobada
          </p>
          <p className={cn(typography('bodySm'), 'mt-1 text-slate-600')}>
            {statusFilter === 'pending' && !search.trim() && !overdueOnly
              ? 'No tens accions pendents assignades.'
              : 'Prova d’ajustar els filtres o la cerca.'}
          </p>
        </div>
      ) : (
        <section className="rounded-xl border bg-white p-4 shadow-sm overflow-hidden">
          <h2 className={cn(typography('sectionTitle'), 'mb-3')}>
            {tableRows.length} acció{tableRows.length === 1 ? '' : 'ns'}
          </h2>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className={cn('w-full min-w-[920px]', typography('bodySm'))}>
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="p-2 text-left font-semibold">Acció</th>
                    <th className="p-2 text-left font-semibold">Incidència</th>
                    <th className="p-2 text-left font-semibold">Estat</th>
                    <th className="p-2 text-left font-semibold">Dept</th>
                    <th className="p-2 text-left font-semibold">Termini</th>
                    <th className="p-2 text-left font-semibold">Creada</th>
                    <th className="p-2 text-left font-semibold">Obrir</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="p-2 align-top max-w-[280px]">
                        <span className="font-medium text-slate-900">{row.title || '—'}</span>
                      </td>
                      <td className="p-2 align-top max-w-[240px] text-slate-800">
                        {row.incidentLabel}
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
                      <td className="p-2 align-top">{(row.department || '').trim() || '—'}</td>
                      <td
                        className={cn(
                          'p-2 align-top whitespace-nowrap',
                          row.isOverdue && 'text-red-700 font-semibold'
                        )}
                      >
                        {row.dueShort}
                      </td>
                      <td className="p-2 align-top whitespace-nowrap text-slate-600">
                        {row.createdShort}
                      </td>
                      <td className="p-2 align-top">
                        <Link
                          href={incidentBoardHref(row.incidentId)}
                          className={cn(
                            typography('bodySm'),
                            'inline-flex items-center gap-1 font-medium text-violet-700 hover:underline'
                          )}
                        >
                          Veure incidència
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

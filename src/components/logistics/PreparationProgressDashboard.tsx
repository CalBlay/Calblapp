'use client'

import { useMemo, type ReactNode } from 'react'
import type { LogisticsEventPrepRow } from '@/lib/logistics/prepTypes'
import {
  computePreparationProgressSummary,
  statusLabel,
  type PrepLineProgress,
  type PrepLineStatus,
} from '@/lib/logistics/preparationProgress'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Clock3,
  MapPin,
  Users,
} from 'lucide-react'
import { formatDateOnly } from '@/lib/date-format'
import { cn } from '@/lib/utils'

export type PreparationEligibleUser = {
  id: string
  name: string
  role: string
}

type PreparationUserProgress = {
  id: string
  name: string
  doneCount: number
  lastDoneAt: string
}

type DayGroup = {
  dayKey: string
  dayLabel: string
  lines: PrepLineProgress[]
  averagePct: number
}

function formatDateTimeLabel(value?: string) {
  const raw = String(value || '').trim()
  if (!raw) return 'Sense registre'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return 'Sense registre'
  return parsed.toLocaleString('ca-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={safePct >= 100 ? '#059669' : safePct >= 25 ? '#3b82f6' : '#f59e0b'}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{safePct}%</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">mitjana</span>
      </div>
    </div>
  )
}

function StackedProgressBar({
  complete,
  inProgress,
  notStarted,
  unscheduled,
  total,
}: {
  complete: number
  inProgress: number
  notStarted: number
  unscheduled: number
  total: number
}) {
  if (total <= 0) return <div className="h-3 rounded-full bg-slate-100" />

  const toPct = (n: number) => (n / total) * 100

  return (
    <div className="space-y-2">
      <div className="flex h-4 overflow-hidden rounded-full bg-slate-100 shadow-inner">
        {complete > 0 ? (
          <div className="bg-emerald-500" style={{ width: `${toPct(complete)}%` }} />
        ) : null}
        {inProgress > 0 ? (
          <div className="bg-sky-500" style={{ width: `${toPct(inProgress)}%` }} />
        ) : null}
        {notStarted > 0 ? (
          <div className="bg-amber-400" style={{ width: `${toPct(notStarted)}%` }} />
        ) : null}
        {unscheduled > 0 ? (
          <div className="bg-slate-300" style={{ width: `${toPct(unscheduled)}%` }} />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <strong className="text-slate-900">{complete}</strong> completades (100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          <strong className="text-slate-900">{inProgress}</strong> en curs
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <strong className="text-slate-900">{notStarted}</strong> sense començar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <strong className="text-slate-900">{unscheduled}</strong> sense planificar
        </span>
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<
  PrepLineStatus,
  { border: string; bg: string; badge: string; icon: typeof CheckCircle2; bar: string }
> = {
  complete: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-50/60',
    badge: 'bg-emerald-600 text-white',
    icon: CheckCircle2,
    bar: 'bg-emerald-500',
  },
  in_progress: {
    border: 'border-l-sky-500',
    bg: 'bg-sky-50/50',
    badge: 'bg-sky-600 text-white',
    icon: Clock3,
    bar: 'bg-sky-500',
  },
  not_started: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-50/40',
    badge: 'bg-amber-500 text-white',
    icon: AlertCircle,
    bar: 'bg-amber-400',
  },
  unscheduled: {
    border: 'border-l-slate-300 border-dashed',
    bg: 'bg-slate-50',
    badge: 'bg-slate-500 text-white',
    icon: CircleDashed,
    bar: 'bg-slate-300',
  },
}

function LineProgressBar({ pct, barClass }: { pct: number; barClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-slate-600">Progrés de l&apos;equip</span>
        <span className="font-bold tabular-nums text-slate-900">{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PrepLineCard({ line, preparadorCount }: { line: PrepLineProgress; preparadorCount: number }) {
  const { row, status, pct } = line
  const styles = STATUS_STYLES[status]
  const Icon = styles.icon
  const workerName = String(row.PreparacioFetaPerNom || '').trim()
  const label = statusLabel(status, pct)

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200 border-l-[5px] p-4 shadow-sm transition hover:shadow-md',
        styles.border,
        styles.bg
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide',
            styles.badge
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
        {row.PreparacioData && row.PreparacioHora ? (
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-slate-900">{row.PreparacioHora}</div>
            <div className="text-xs font-medium text-slate-500">
              {formatDateOnly(row.PreparacioData, '')}
            </div>
          </div>
        ) : (
          <div className="text-right text-xs font-medium text-slate-400">Sense hora</div>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 text-base font-bold leading-snug text-slate-900">
        {row.NomEvent || 'Sense nom'}
      </h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
        {row.EventCode ? (
          <span className="rounded-md bg-white/80 px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
            {row.EventCode}
          </span>
        ) : null}
        {row.Ubicacio ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            {row.Ubicacio}
          </span>
        ) : null}
        {row.NumPax != null ? <span>{row.NumPax} pax</span> : null}
      </div>

      {status !== 'unscheduled' ? (
        <div className="mt-3">
          <LineProgressBar pct={pct} barClass={styles.bar} />
          <div className="mt-1 text-[11px] text-slate-500">
            {line.registeredCount} de {preparadorCount} preparadors han registrat
          </div>
        </div>
      ) : null}

      <div className="mt-3 border-t border-slate-200/80 pt-3">
        {status === 'in_progress' || status === 'complete' ? (
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white',
                status === 'complete' ? 'bg-emerald-600' : 'bg-sky-600'
              )}
            >
              {initials(workerName || '?')}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {workerName || 'Sense registrar'}
              </div>
              <div className="text-xs text-slate-500">
                Registre: {formatDateTimeLabel(row.PreparacioFetaAt)}
              </div>
            </div>
          </div>
        ) : status === 'not_started' ? (
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="font-medium">Cap preparador ha registrat activitat</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CircleDashed className="h-4 w-4 shrink-0" />
            <span>Falta data o hora de preparació</span>
          </div>
        )}
      </div>
    </article>
  )
}

function DayGroupSection({ group, preparadorCount }: { group: DayGroup; preparadorCount: number }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-bold">{group.dayLabel}</div>
          <div className="text-sm text-slate-300">
            {group.lines.length} línies · mitjana d&apos;equip {group.averagePct}%
          </div>
        </div>
        <div className="min-w-[120px]">
          <div className="mb-1 text-right text-2xl font-bold tabular-nums">{group.averagePct}%</div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className={cn(
                'h-full rounded-full',
                group.averagePct >= 100
                  ? 'bg-emerald-400'
                  : group.averagePct > 0
                    ? 'bg-sky-400'
                    : 'bg-amber-400'
              )}
              style={{ width: `${group.averagePct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.lines.map((line) => (
          <PrepLineCard key={line.row.id} line={line} preparadorCount={preparadorCount} />
        ))}
      </div>
    </section>
  )
}

function WorkerCard({
  name,
  doneCount,
  lastDoneAt,
  plannedTotal,
  active,
}: {
  name: string
  doneCount: number
  lastDoneAt: string
  plannedTotal: number
  active: boolean
}) {
  const pct = plannedTotal > 0 ? Math.round((doneCount / plannedTotal) * 100) : 0

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition',
        active
          ? 'border-sky-200 bg-gradient-to-br from-sky-50 to-white'
          : 'border-slate-200 bg-slate-50/80'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            active ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'
          )}
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{name}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {active
              ? `Últim registre: ${formatDateTimeLabel(lastDoneAt)}`
              : 'Cap registre en aquest rang'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-slate-900">{doneCount}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            registres
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-500">Línies registrades / planificades</span>
          <span className="font-bold text-slate-800">{pct}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={cn('h-full rounded-full', active ? 'bg-sky-500' : 'bg-slate-300')}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function GlanceColumn({
  title,
  count,
  color,
  icon: Icon,
  lines,
  emptyText,
  renderExtra,
}: {
  title: string
  count: number
  color: 'emerald' | 'sky' | 'amber' | 'slate'
  icon: typeof CheckCircle2
  lines: PrepLineProgress[]
  emptyText: string
  renderExtra?: (line: PrepLineProgress) => ReactNode
}) {
  const colorMap = {
    emerald: 'border-emerald-200 bg-emerald-50/40 text-emerald-800',
    sky: 'border-sky-200 bg-sky-50/40 text-sky-900',
    amber: 'border-amber-300 bg-amber-50/50 text-amber-900',
    slate: 'border-dashed border-slate-300 bg-slate-50 text-slate-700',
  }
  const badgeMap = {
    emerald: 'bg-emerald-600',
    sky: 'bg-sky-600',
    amber: 'bg-amber-500',
    slate: 'bg-slate-500',
  }

  return (
    <div className={cn('rounded-2xl border-2 p-4', colorMap[color])}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold">
          <Icon className="h-5 w-5" />
          {title}
        </span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-bold text-white', badgeMap[color])}>
          {count}
        </span>
      </div>
      <div className="space-y-2">
        {lines.slice(0, 6).map((line) => (
          <div key={line.row.id} className="rounded-lg bg-white/80 px-2 py-1.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-slate-800">
                {line.row.NomEvent || line.row.EventCode}
              </span>
              {renderExtra ? (
                <span className="ml-auto shrink-0 font-semibold tabular-nums">{renderExtra(line)}</span>
              ) : null}
            </div>
          </div>
        ))}
        {count === 0 ? <p className="text-xs opacity-70">{emptyText}</p> : null}
        {count > 6 ? <p className="text-xs opacity-70">+{count - 6} més a sota</p> : null}
      </div>
    </div>
  )
}

const STATUS_SORT: Record<PrepLineStatus, number> = {
  not_started: 0,
  in_progress: 1,
  complete: 2,
  unscheduled: 3,
}

export default function PreparationProgressDashboard({
  rows,
  dateRange,
  eligibleUsers,
}: {
  rows: LogisticsEventPrepRow[]
  dateRange: { start: string; end: string } | null
  eligibleUsers: PreparationEligibleUser[]
}) {
  const summary = useMemo(() => {
    const preparadorCount = Math.max(1, eligibleUsers.length)
    const base = computePreparationProgressSummary(rows, preparadorCount)

    const dayMap = new Map<string, PrepLineProgress[]>()
    const unscheduledGroup: PrepLineProgress[] = []

    base.lines.forEach((line) => {
      if (line.status === 'unscheduled') {
        unscheduledGroup.push(line)
        return
      }
      const dayKey = line.row.PreparacioData || 'sense-data'
      const bucket = dayMap.get(dayKey) || []
      bucket.push(line)
      dayMap.set(dayKey, bucket)
    })

    const dayGroups: DayGroup[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dayKey, dayLines]) => {
        const sorted = [...dayLines].sort((a, b) => {
          if (STATUS_SORT[a.status] !== STATUS_SORT[b.status]) {
            return STATUS_SORT[a.status] - STATUS_SORT[b.status]
          }
          return String(a.row.PreparacioHora || '').localeCompare(String(b.row.PreparacioHora || ''))
        })
        const averagePct = sorted.length
          ? Math.round(sorted.reduce((sum, line) => sum + line.pct, 0) / sorted.length)
          : 0
        return { dayKey, dayLabel: formatDateOnly(dayKey, dayKey), lines: sorted, averagePct }
      })

    const registeredLines = base.lines.filter(
      (line) => line.status === 'in_progress' || line.status === 'complete'
    )

    const users = new Map<string, PreparationUserProgress>()
    registeredLines.forEach(({ row }) => {
      const userId = String(row.PreparacioFetaPerUserId || '').trim()
      const name = String(row.PreparacioFetaPerNom || '').trim() || 'Sense registrar'
      const key = userId || `unknown:${name}`
      const current = users.get(key)
      const lastDoneAt =
        !current || String(row.PreparacioFetaAt || '') > current.lastDoneAt
          ? String(row.PreparacioFetaAt || '')
          : current.lastDoneAt

      users.set(key, {
        id: userId,
        name,
        doneCount: (current?.doneCount || 0) + 1,
        lastDoneAt,
      })
    })

    const knownUsers = eligibleUsers.map((user) => {
      const progress = users.get(user.id)
      return {
        id: user.id,
        name: user.name,
        doneCount: progress?.doneCount || 0,
        lastDoneAt: progress?.lastDoneAt || '',
        active: (progress?.doneCount || 0) > 0,
      }
    })

    const unknownUsers = Array.from(users.values())
      .filter((item) => !item.id || !eligibleUsers.some((u) => u.id === item.id))
      .map((item) => ({ ...item, active: true }))

    const rankedUsers = [...knownUsers, ...unknownUsers].sort((a, b) => {
      if (b.doneCount !== a.doneCount) return b.doneCount - a.doneCount
      return a.name.localeCompare(b.name, 'ca')
    })

    return {
      ...base,
      dayGroups,
      unscheduledGroup,
      rankedUsers,
      activeWorkers: rankedUsers.filter((u) => u.active),
      inactiveWorkers: rankedUsers.filter((u) => !u.active),
      completeLines: base.lines.filter((l) => l.status === 'complete'),
      inProgressLines: base.lines.filter((l) => l.status === 'in_progress'),
      notStartedLines: base.lines.filter((l) => l.status === 'not_started'),
    }
  }, [eligibleUsers, rows])

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
        <p className="mt-1 text-xs text-slate-400">{rangeLabel}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white shadow-lg">
        <div className="grid gap-6 p-5 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex justify-center lg:justify-start">
            <div className="rounded-full bg-white p-2 shadow-xl">
              <ProgressRing pct={summary.averageCompletionPct} />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                Panoràmica del rang
              </div>
              <div className="mt-1 text-2xl font-bold">{rangeLabel}</div>
              <div className="mt-1 text-sm text-slate-300">
                Mitjana d&apos;equip: {summary.averageCompletionPct}% · {summary.preparadorCount}{' '}
                preparadors · cada registre = 1/{summary.preparadorCount} de la línia
              </div>
            </div>

            <StackedProgressBar
              complete={summary.completeCount}
              inProgress={summary.inProgressCount}
              notStarted={summary.notStartedCount}
              unscheduled={summary.unscheduledCount}
              total={summary.totalCount}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur-sm">
                <div className="text-2xl font-bold tabular-nums">{summary.totalCount}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-300">Total</div>
              </div>
              <div className="rounded-xl bg-emerald-500/20 px-3 py-2 ring-1 ring-emerald-400/30">
                <div className="text-2xl font-bold tabular-nums text-emerald-200">
                  {summary.completeCount}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-emerald-100">100%</div>
              </div>
              <div className="rounded-xl bg-sky-500/20 px-3 py-2 ring-1 ring-sky-400/30">
                <div className="text-2xl font-bold tabular-nums text-sky-200">
                  {summary.inProgressCount}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-sky-100">En curs</div>
              </div>
              <div className="rounded-xl bg-amber-500/20 px-3 py-2 ring-1 ring-amber-400/30">
                <div className="text-2xl font-bold tabular-nums text-amber-200">
                  {summary.notStartedCount}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-amber-100">A 0%</div>
              </div>
              <div className="rounded-xl bg-white/10 px-3 py-2">
                <div className="text-2xl font-bold tabular-nums">{summary.unscheduledCount}</div>
                <div className="text-[11px] uppercase tracking-wide text-slate-300">Sense data</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          <span className="h-1 w-6 rounded-full bg-sky-500" />
          Estat d&apos;un cop d&apos;ull
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <GlanceColumn
            title="Completades (100%)"
            count={summary.completeCount}
            color="emerald"
            icon={CheckCircle2}
            lines={summary.completeLines}
            emptyText="Cap línia al 100% de l'equip."
            renderExtra={(line) => `${line.pct}%`}
          />
          <GlanceColumn
            title="En curs"
            count={summary.inProgressCount}
            color="sky"
            icon={Clock3}
            lines={summary.inProgressLines}
            emptyText="Cap línia amb registres parcials."
            renderExtra={(line) => `${line.pct}%`}
          />
          <GlanceColumn
            title="Sense començar"
            count={summary.notStartedCount}
            color="amber"
            icon={AlertCircle}
            lines={summary.notStartedLines}
            emptyText="Totes les planificades tenen algun registre."
            renderExtra={(line) => line.row.PreparacioHora || '—'}
          />
          <GlanceColumn
            title="Sense planificar"
            count={summary.unscheduledCount}
            color="slate"
            icon={CircleDashed}
            lines={summary.unscheduledGroup}
            emptyText="Totes tenen data i hora."
          />
        </div>
      </section>

      {summary.rankedUsers.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            <Users className="h-4 w-4" />
            Qui ha registrat activitat
          </h2>

          {summary.activeWorkers.length > 0 ? (
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">
                Amb registres ({summary.activeWorkers.length})
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {summary.activeWorkers.map((user) => (
                  <WorkerCard
                    key={`${user.id || 'unknown'}-${user.name}`}
                    name={user.name}
                    doneCount={user.doneCount}
                    lastDoneAt={user.lastDoneAt}
                    plannedTotal={summary.plannedCount}
                    active
                  />
                ))}
              </div>
            </div>
          ) : null}

          {summary.inactiveWorkers.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Sense registres ({summary.inactiveWorkers.length})
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {summary.inactiveWorkers.map((user) => (
                  <WorkerCard
                    key={`${user.id || 'unknown'}-${user.name}`}
                    name={user.name}
                    doneCount={0}
                    lastDoneAt=""
                    plannedTotal={summary.plannedCount}
                    active={false}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-6">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
          <CalendarDays className="h-4 w-4" />
          Detall de cada línia
        </h2>

        {summary.dayGroups.map((group) => (
          <DayGroupSection
            key={group.dayKey}
            group={group}
            preparadorCount={summary.preparadorCount}
          />
        ))}

        {summary.unscheduledGroup.length > 0 ? (
          <section className="space-y-3">
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 text-base font-bold text-slate-700">
                <CircleDashed className="h-5 w-5" />
                Sense data de preparació assignada
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {summary.unscheduledGroup.length} línies pendents de planificar
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summary.unscheduledGroup.map((line) => (
                <PrepLineCard
                  key={line.row.id}
                  line={line}
                  preparadorCount={summary.preparadorCount}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  )
}

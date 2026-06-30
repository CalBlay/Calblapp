'use client'

import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatProjectDate,
  getBlockDepartments,
  type ProjectData,
} from './project-shared'
import {
  projectCardMetaClass,
  projectCardTitleClass,
  projectEmptyStateClass,
  projectModuleShellClass,
  projectPanelClass,
  projectSectionTitleClass,
} from './project-ui'

export type TrackingAlertTarget = {
  tab: 'blocks' | 'tasks'
  blockId: string
  taskId?: string
}

type TrackingAlert = {
  key: string
  title: string
  detail?: string
  tone: 'rose' | 'amber'
  actionLabel: string
  target: TrackingAlertTarget
}

type Props = {
  project: ProjectData
  onResolveAlert?: (target: TrackingAlertTarget) => void
  onOpenBlock?: (blockId: string) => void
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const dayDiffFromToday = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const target = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const blockDeadlineClass = (daysLeft: number | null) => {
  if (daysLeft === null) return 'bg-slate-50 text-slate-900'
  if (daysLeft < 0) return 'bg-rose-100 text-rose-700'
  if (daysLeft <= 2) return 'bg-amber-100 text-amber-800'
  return 'bg-slate-50 text-slate-900'
}

const blockDeadlineHint = (daysLeft: number | null) => {
  if (daysLeft === null) return 'Sense data'
  if (daysLeft < 0) return `Retard de ${Math.abs(daysLeft)} dies`
  if (daysLeft === 0) return 'Venc avui'
  if (daysLeft <= 2) return `Falten ${daysLeft} dies`
  return 'En termini'
}

const toPercent = (value: number, total: number) => {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

const parseStoryPoints = (value?: string | number | null) => {
  const parsed = Number(String(value || '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

const blockStatusLabel = (value: string) => {
  if (value === 'in_progress') return 'En curs'
  if (value === 'blocked') return 'Bloquejat'
  if (value === 'overdue') return 'En retard'
  if (value === 'done') return 'Fet'
  return 'Pendent'
}

const taskStatusLabel = (value: string) => {
  if (value === 'in_progress') return 'En curs'
  if (value === 'blocked') return 'Bloquejada'
  if (value === 'done') return 'Feta'
  return 'Pendent'
}

const blockStatusClass = (value: string) => {
  if (value === 'done') return 'bg-emerald-100 text-emerald-700'
  if (value === 'blocked') return 'bg-rose-100 text-rose-700'
  if (value === 'overdue') return 'bg-amber-100 text-amber-800'
  if (value === 'in_progress') return 'bg-amber-100 text-amber-800'
  return 'bg-sky-100 text-sky-800'
}

const blockStatusTheme: Record<string, { card: string; metric: string }> = {
  pending: {
    card: 'border-sky-200/80 bg-[#eef4ff]',
    metric: 'border-sky-100/80 bg-white/85',
  },
  in_progress: {
    card: 'border-amber-200/80 bg-[#fff4e2]',
    metric: 'border-amber-100/80 bg-white/85',
  },
  blocked: {
    card: 'border-rose-200/80 bg-[#fff0f3]',
    metric: 'border-rose-100/80 bg-white/85',
  },
  overdue: {
    card: 'border-orange-200/80 bg-[#fff4e2]',
    metric: 'border-orange-100/80 bg-white/85',
  },
  done: {
    card: 'border-emerald-200/80 bg-[#effaf3]',
    metric: 'border-emerald-100/80 bg-white/85',
  },
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string
  hint?: string
  icon: ReactNode
}) {
  return (
    <div className={cn(projectPanelClass, 'p-4')}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}

function TrackingAlertRow({
  alert,
  onResolve,
}: {
  alert: TrackingAlert
  onResolve?: (target: TrackingAlertTarget) => void
}) {
  const clickable = Boolean(onResolve)

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-2.5 py-2 shadow-sm transition',
        alert.tone === 'rose'
          ? 'border-rose-200/80 bg-rose-50/80'
          : 'border-amber-200/80 bg-amber-50/80'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          alert.tone === 'rose' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        {clickable ? (
          <button
            type="button"
            className="group w-full min-w-0 text-left"
            onClick={() => onResolve?.(alert.target)}
          >
            <div className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-violet-700 group-hover:underline">
              {alert.title}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {alert.detail ? <span className="text-xs text-slate-600">{alert.detail}</span> : null}
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                {alert.actionLabel}
                <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        ) : (
          <>
            <div className="text-sm font-semibold text-slate-900">{alert.title}</div>
            {alert.detail ? <p className="mt-0.5 text-xs text-slate-600">{alert.detail}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}

export default function ProjectTrackingTab({ project, onResolveAlert, onOpenBlock }: Props) {
  const launchCountdown = dayDiffFromToday(project.launchDate)
  const allTasks = project.blocks.flatMap((block) =>
    block.tasks.map((task) => ({
      ...task,
      blockId: block.id,
      blockName: block.name,
    }))
  )
  const completedBlocks = project.blocks.filter((block) => block.status === 'done').length
  const completedTasks = allTasks.filter((task) => task.status === 'done').length
  const blockedBlocks = project.blocks.filter((block) => block.status === 'blocked')
  const overdueBlocks = project.blocks.filter((block) => block.status === 'overdue')
  const overdueTasks = allTasks.filter(
    (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
  )
  const criticalTasks = allTasks.filter(
    (task) => task.priority === 'critical' && task.status !== 'done'
  )
  const blocksWithoutOwner = project.blocks.filter((block) => !block.owner.trim())
  const tasksWithoutOwner = allTasks.filter((task) => !task.owner.trim())
  const pendingAssignments = blocksWithoutOwner.length + tasksWithoutOwner.length
  const hasSprints = (project.sprints || []).length > 0
  const sprintStats = (project.sprints || []).map((sprint) => {
    const sprintTasks = allTasks.filter((task) => String(task.sprintId || '').trim() === sprint.id)
    const committedPoints = sprintTasks.reduce((sum, task) => sum + parseStoryPoints(task.storyPoints), 0)
    const completedPoints = sprintTasks
      .filter((task) => task.status === 'done')
      .reduce((sum, task) => sum + parseStoryPoints(task.storyPoints), 0)
    const spilledTasks = sprintTasks.filter((task) => task.status !== 'done').length
    return {
      sprint,
      sprintTasks,
      committedPoints,
      completedPoints,
      completionRate: toPercent(completedPoints, committedPoints || sprintTasks.length),
      spilledTasks,
    }
  })
  const activeSprintStat =
    sprintStats.find((item) => item.sprint.status === 'active') ||
    sprintStats[sprintStats.length - 1] ||
    null
  const alerts: TrackingAlert[] = [
    ...blockedBlocks.map((block) => ({
      key: `block-blocked-${block.id}`,
      title: `Bloc bloquejat: ${block.name}`,
      detail: 'Revisa l’estat i desbloqueja el bloc.',
      tone: 'rose' as const,
      actionLabel: 'Obrir bloc',
      target: { tab: 'blocks' as const, blockId: block.id },
    })),
    ...overdueBlocks.map((block) => ({
      key: `block-overdue-${block.id}`,
      title: `Bloc en retard: ${block.name}`,
      detail: `Data límit: ${formatProjectDate(block.deadline)}`,
      tone: 'amber' as const,
      actionLabel: 'Revisar bloc',
      target: { tab: 'blocks' as const, blockId: block.id },
    })),
    ...overdueTasks.map((task) => ({
      key: `task-overdue-${task.id}`,
      title: `Tasca vençuda: ${task.title}`,
      detail: `Bloc ${task.blockName} · ${formatProjectDate(task.deadline)}`,
      tone: 'amber' as const,
      actionLabel: 'Obrir tasca',
      target: { tab: 'tasks' as const, blockId: task.blockId, taskId: task.id },
    })),
    ...criticalTasks.map((task) => ({
      key: `task-critical-${task.id}`,
      title: `Tasca crítica oberta: ${task.title}`,
      detail: `Bloc ${task.blockName}`,
      tone: 'rose' as const,
      actionLabel: 'Obrir tasca',
      target: { tab: 'tasks' as const, blockId: task.blockId, taskId: task.id },
    })),
    ...blocksWithoutOwner.map((block) => ({
      key: `block-owner-${block.id}`,
      title: `Bloc sense responsable: ${block.name}`,
      detail: 'Assigna un responsable al bloc.',
      tone: 'amber' as const,
      actionLabel: 'Assignar responsable',
      target: { tab: 'blocks' as const, blockId: block.id },
    })),
    ...tasksWithoutOwner.map((task) => ({
      key: `task-owner-${task.id}`,
      title: `Tasca sense responsable: ${task.title}`,
      detail: `Bloc ${task.blockName}`,
      tone: 'amber' as const,
      actionLabel: 'Assignar responsable',
      target: { tab: 'tasks' as const, blockId: task.blockId, taskId: task.id },
    })),
  ].sort((left, right) => {
    if (left.tone !== right.tone) return left.tone === 'rose' ? -1 : 1
    return left.title.localeCompare(right.title, 'ca')
  })

  return (
    <section className={cn(projectModuleShellClass, 'space-y-5 p-5')}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Alertes obertes"
          value={String(alerts.length)}
          hint={alerts.length > 0 ? 'Requereixen acció' : 'Cap incidència pendent'}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Tasques completes"
          value={`${completedTasks}/${allTasks.length}`}
          hint={`${toPercent(completedTasks, allTasks.length)}% del total`}
        />
        <MetricCard
          icon={<FolderKanban className="h-4 w-4" />}
          label="Blocs completats"
          value={`${completedBlocks}/${project.blocks.length}`}
          hint={`${toPercent(completedBlocks, project.blocks.length)}% del total`}
        />
        <MetricCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Arrencada"
          value={formatProjectDate(project.launchDate)}
          hint={
            launchCountdown === null
              ? 'Sense comptador'
              : launchCountdown > 0
                ? `Falten ${launchCountdown} dies`
                : launchCountdown === 0
                  ? 'Arrencada avui'
                  : `Retard de ${Math.abs(launchCountdown)} dies`
          }
        />
        <MetricCard
          icon={<UserRound className="h-4 w-4" />}
          label="Assignacions pendents"
          value={String(pendingAssignments)}
          hint={`${blocksWithoutOwner.length} blocs · ${tasksWithoutOwner.length} tasques`}
        />
      </div>

      {hasSprints ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            icon={<UserRound className="h-4 w-4" />}
            label="Sprint actiu"
            value={activeSprintStat?.sprint.name || 'Sense sprint actiu'}
            hint={`${activeSprintStat?.sprintTasks.length || 0} tasques al sprint`}
          />
          <MetricCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Story points del sprint"
            value={
              activeSprintStat
                ? `${activeSprintStat.completedPoints} / ${activeSprintStat.committedPoints} SP`
                : '0 / 0 SP'
            }
            hint={
              activeSprintStat
                ? `${activeSprintStat.completionRate}% completat`
                : 'Crea i assigna tasques a sprints'
            }
          />
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-stretch">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={`flex items-center gap-2 ${projectSectionTitleClass}`}>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alertes
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold',
                alerts.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
              )}
            >
              {alerts.length > 0 ? `${alerts.length} obertes` : 'Tot en ordre'}
            </span>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            Clica una alerta per resoldre-la. Després de guardar, desapareix d’aquesta llista.
          </p>

          {alerts.length > 0 ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {alerts.map((alert) => (
                <TrackingAlertRow key={alert.key} alert={alert} onResolve={onResolveAlert} />
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-1 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              No hi ha alertes obertes. El seguiment del projecte està al dia.
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className={projectSectionTitleClass}>Seguiment per blocs</div>
          <p className="mt-1 text-sm text-slate-500">Vista resum de cada bloc i el seu progrés de tasques.</p>

          {project.blocks.length > 0 ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {project.blocks.map((block) => {
                const blockTasks = block.tasks || []
                const doneTasks = blockTasks.filter((task) => task.status === 'done').length
                const overdueBlockTasks = blockTasks.filter(
                  (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
                ).length
                const deadlineCountdown = dayDiffFromToday(block.deadline)
                const theme =
                  blockStatusTheme[block.status] ||
                  blockStatusTheme.pending

                return (
                  <div
                    key={block.id}
                    className={cn(
                      'rounded-[18px] border px-4 py-4 shadow-sm transition',
                      theme.card,
                      onOpenBlock && 'hover:shadow-md'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {onOpenBlock ? (
                          <button
                            type="button"
                            className="group text-left"
                            onClick={() => onOpenBlock(block.id)}
                          >
                            <div className={`${projectCardTitleClass} group-hover:text-violet-700 group-hover:underline`}>
                              {block.name}
                            </div>
                          </button>
                        ) : (
                          <div className={projectCardTitleClass}>{block.name}</div>
                        )}
                        <div className={`mt-1 flex flex-wrap items-center gap-2 ${projectCardMetaClass}`}>
                          <span>{getBlockDepartments(block).join(', ') || 'Sense departament'}</span>
                          <span>·</span>
                          <span>{block.owner || 'Sense responsable'}</span>
                          <span>·</span>
                          <span>{formatProjectDate(block.deadline)}</span>
                          {block.budget ? (
                            <>
                              <span>·</span>
                              <span>{block.budget} EUR</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${blockStatusClass(block.status)}`}>
                        {blockStatusLabel(block.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-5">
                      <div className={`rounded-xl px-3 py-2 ${blockDeadlineClass(deadlineCountdown)}`}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Data límit</div>
                        <div className="mt-1 text-sm font-semibold">{formatProjectDate(block.deadline)}</div>
                        <div className="mt-0.5 text-xs">{blockDeadlineHint(deadlineCountdown)}</div>
                      </div>
                      <div className={cn('rounded-xl border px-3 py-2', theme.metric)}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tasques</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{blockTasks.length}</div>
                      </div>
                      <div className={cn('rounded-xl border px-3 py-2', theme.metric)}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Completat</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {toPercent(doneTasks, blockTasks.length)}%
                        </div>
                      </div>
                      <div className={cn('rounded-xl border px-3 py-2', theme.metric)}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vençudes</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{overdueBlockTasks}</div>
                      </div>
                      <div className={cn('rounded-xl border px-3 py-2', theme.metric)}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estat tasques</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {blockTasks.length > 0
                            ? taskStatusLabel(
                                blockTasks.find((task) => task.status !== 'done')?.status || 'done'
                              )
                            : 'Sense tasques'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={`mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 ${projectEmptyStateClass}`}>
              Encara no hi ha blocs creats.
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

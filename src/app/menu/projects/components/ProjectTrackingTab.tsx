'use client'

import type { Dispatch, ReactNode, SetStateAction } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FolderKanban,
  Save,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  projectOverviewInputClass,
  projectOverviewLabelClass,
  projectOverviewSelectClass,
  projectPanelClass,
  projectSectionTitleClass,
} from './project-ui'
import type { ResponsibleOption } from './project-workspace-helpers'

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
  ownerOptions: ResponsibleOption[]
  canManageProject?: boolean
  savingOverview?: boolean
  dirtyOverview?: boolean
  onProjectChange?: Dispatch<SetStateAction<ProjectData>>
  onSaveOverview?: () => void
  onResolveAlert?: (target: TrackingAlertTarget) => void
  onOpenBlock?: (blockId: string) => void
}

type FlatTask = ProjectData['blocks'][number]['tasks'][number] & {
  blockId: string
  blockName: string
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

const toPercent = (value: number, total: number) => {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

const deadlineHint = (daysLeft: number | null) => {
  if (daysLeft === null) return 'Sense data'
  if (daysLeft < 0) return `Retard de ${Math.abs(daysLeft)} dies`
  if (daysLeft === 0) return 'Venc avui'
  if (daysLeft <= 2) return `Falten ${daysLeft} dies`
  return 'En termini'
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

const taskStatusClass = (value: string) => {
  if (value === 'done') return 'bg-emerald-100 text-emerald-700'
  if (value === 'blocked') return 'bg-rose-100 text-rose-700'
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

function TaskTrackingCard({ task }: { task: FlatTask }) {
  const taskDeadline = dayDiffFromToday(task.deadline)
  const priorityLabel =
    task.priority === 'critical'
      ? 'Crítica'
      : task.priority === 'high'
        ? 'Alta'
        : task.priority === 'low'
          ? 'Baixa'
          : 'Normal'

  return (
    <div className="rounded-[18px] border border-slate-200/80 bg-slate-50/60 px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={projectCardTitleClass}>{task.title}</div>
          <div className={`mt-1 flex flex-wrap items-center gap-2 ${projectCardMetaClass}`}>
            <span>{task.blockName}</span>
            <span>·</span>
            <span>{task.owner || 'Sense responsable'}</span>
            <span>·</span>
            <span>{formatProjectDate(task.deadline)}</span>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${taskStatusClass(task.status)}`}>
          {taskStatusLabel(task.status)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div
          className={cn(
            'rounded-xl border bg-white px-3 py-2',
            taskDeadline !== null && taskDeadline < 0
              ? 'border-rose-200 text-rose-700'
              : 'border-slate-200 text-slate-900'
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data límit</div>
          <div className="mt-1 text-sm font-semibold">{formatProjectDate(task.deadline)}</div>
          <div className="mt-0.5 text-xs">{deadlineHint(taskDeadline)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Bloc</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{task.blockName}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Responsable</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{task.owner || 'Sense responsable'}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Prioritat</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{priorityLabel}</div>
        </div>
      </div>
    </div>
  )
}

export default function ProjectTrackingTab({
  project,
  ownerOptions,
  canManageProject = false,
  savingOverview = false,
  dirtyOverview = false,
  onProjectChange,
  onSaveOverview,
  onResolveAlert,
  onOpenBlock,
}: Props) {
  const launchCountdown = dayDiffFromToday(project.launchDate)
  const allTasks: FlatTask[] = project.blocks.flatMap((block) =>
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

  const alerts: TrackingAlert[] = [
    ...blockedBlocks.map((block) => ({
      key: `block-blocked-${block.id}`,
      title: `Bloc bloquejat: ${block.name}`,
      detail: 'Revisa l estat i desbloqueja el bloc.',
      tone: 'rose' as const,
      actionLabel: 'Obrir bloc',
      target: { tab: 'blocks' as const, blockId: block.id },
    })),
    ...overdueBlocks.map((block) => ({
      key: `block-overdue-${block.id}`,
      title: `Bloc en retard: ${block.name}`,
      detail: `Data limit: ${formatProjectDate(block.deadline)}`,
      tone: 'amber' as const,
      actionLabel: 'Revisar bloc',
      target: { tab: 'blocks' as const, blockId: block.id },
    })),
    ...overdueTasks.map((task) => ({
      key: `task-overdue-${task.id}`,
      title: `Tasca vencuda: ${task.title}`,
      detail: `Bloc ${task.blockName} · ${formatProjectDate(task.deadline)}`,
      tone: 'amber' as const,
      actionLabel: 'Obrir tasca',
      target: { tab: 'tasks' as const, blockId: task.blockId, taskId: task.id },
    })),
    ...criticalTasks.map((task) => ({
      key: `task-critical-${task.id}`,
      title: `Tasca critica oberta: ${task.title}`,
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
      <section className={cn(projectPanelClass, 'p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={projectSectionTitleClass}>Dades del projecte</div>
            <p className="mt-1 text-sm text-slate-500">
              Edita responsable, inici, arrencada i data limit des d aqui.
            </p>
          </div>
          {canManageProject ? (
            <Button
              type="button"
              onClick={onSaveOverview}
              disabled={!dirtyOverview || savingOverview}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {savingOverview ? 'Guardant...' : 'Guardar dades'}
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="tracking-project-owner" className={projectOverviewLabelClass}>
              Responsable del projecte
            </Label>
            {canManageProject ? (
              <select
                id="tracking-project-owner"
                value={project.owner || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({ ...current, owner: event.target.value }))
                }
                className={projectOverviewSelectClass}
              >
                <option value="">Selecciona responsable</option>
                {ownerOptions.map((option) => (
                  <option key={`${option.id}-${option.name}`} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                {project.owner || 'Sense responsable'}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking-project-start" className={projectOverviewLabelClass}>
              Data d inici
            </Label>
            {canManageProject ? (
              <Input
                id="tracking-project-start"
                type="date"
                value={project.startDate || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({ ...current, startDate: event.target.value }))
                }
                className={projectOverviewInputClass}
              />
            ) : (
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                {formatProjectDate(project.startDate)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking-project-kickoff" className={projectOverviewLabelClass}>
              Arrencada
            </Label>
            {canManageProject ? (
              <Input
                id="tracking-project-kickoff"
                type="date"
                value={project.kickoff.date || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({
                    ...current,
                    kickoff: {
                      ...current.kickoff,
                      date: event.target.value,
                    },
                  }))
                }
                className={projectOverviewInputClass}
              />
            ) : (
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                {formatProjectDate(project.kickoff.date)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking-project-deadline" className={projectOverviewLabelClass}>
              Deadline del projecte
            </Label>
            {canManageProject ? (
              <Input
                id="tracking-project-deadline"
                type="date"
                value={project.launchDate || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({ ...current, launchDate: event.target.value }))
                }
                className={projectOverviewInputClass}
              />
            ) : (
              <div className="flex h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                {formatProjectDate(project.launchDate)}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<FolderKanban className="h-4 w-4" />}
          label="Blocs completats"
          value={`${completedBlocks}/${project.blocks.length}`}
          hint={`${toPercent(completedBlocks, project.blocks.length)}% del total`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Tasques completes"
          value={`${completedTasks}/${allTasks.length}`}
          hint={`${toPercent(completedTasks, allTasks.length)}% del total`}
        />
        <MetricCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Data"
          value={formatProjectDate(project.launchDate)}
          hint={
            launchCountdown === null
              ? 'Sense comptador'
              : launchCountdown > 0
                ? `Falten ${launchCountdown} dies`
                : launchCountdown === 0
                  ? 'Venc avui'
                  : `Retard de ${Math.abs(launchCountdown)} dies`
          }
        />
        <MetricCard
          icon={<UserRound className="h-4 w-4" />}
          label="Assignacions pendents"
          value={String(pendingAssignments)}
          hint={`${blocksWithoutOwner.length} blocs · ${tasksWithoutOwner.length} tasques`}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Alertes obertes"
          value={String(alerts.length)}
          hint={alerts.length > 0 ? 'Requereixen accio' : 'Cap incidencia pendent'}
        />
      </div>

      <div className="space-y-5">
        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className={projectSectionTitleClass}>Seguiment de blocs</div>
          <p className="mt-1 text-sm text-slate-500">Vista resum de cada bloc i del seu progres.</p>

          {project.blocks.length > 0 ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {project.blocks.map((block) => {
                const blockTasks = block.tasks || []
                const doneTasks = blockTasks.filter((task) => task.status === 'done').length
                const overdueBlockTasks = blockTasks.filter(
                  (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
                ).length
                const deadlineCountdown = dayDiffFromToday(block.deadline)
                const theme = blockStatusTheme[block.status] || blockStatusTheme.pending

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
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${blockStatusClass(block.status)}`}>
                        {blockStatusLabel(block.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-5">
                      <div className={cn('rounded-xl px-3 py-2', deadlineCountdown !== null && deadlineCountdown < 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-50 text-slate-900')}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Data limit</div>
                        <div className="mt-1 text-sm font-semibold">{formatProjectDate(block.deadline)}</div>
                        <div className="mt-0.5 text-xs">{deadlineHint(deadlineCountdown)}</div>
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
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vencudes</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{overdueBlockTasks}</div>
                      </div>
                      <div className={cn('rounded-xl border px-3 py-2', theme.metric)}>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Estat</div>
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

        <section className="flex min-h-0 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className={projectSectionTitleClass}>Seguiment de tasques</div>
          <p className="mt-1 text-sm text-slate-500">Resum rapid de les tasques obertes i del seu estat actual.</p>

          {allTasks.length > 0 ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              {allTasks.map((task) => (
                <TaskTrackingCard key={`${task.blockId}:${task.id}`} task={task} />
              ))}
            </div>
          ) : (
            <div className={`mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 ${projectEmptyStateClass}`}>
              Encara no hi ha tasques creades.
            </div>
          )}
        </section>

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
            Clica una alerta per resoldre la. Despres de guardar, desapareix d aquesta llista.
          </p>

          {alerts.length > 0 ? (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
              {alerts.map((alert) => (
                <TrackingAlertRow key={alert.key} alert={alert} onResolve={onResolveAlert} />
              ))}
            </div>
          ) : (
            <div className="mt-3 flex flex-1 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              No hi ha alertes obertes. El seguiment del projecte esta al dia.
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

'use client'

import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderKanban,
  Layers,
  ListTodo,
  Save,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { colorByDepartment } from '@/lib/colors'
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
  projectOverviewChipClass,
  projectOverviewInputClass,
  projectOverviewLabelClass,
  projectOverviewMetaClass,
  projectOverviewSectionSubtitleClass,
  projectOverviewSectionTitleClass,
  projectOverviewSelectClass,
  projectPrimaryButtonClass,
  projectTrackingCardAccentClass,
  projectTrackingCardClass,
  projectTrackingIconBoxClass,
  projectTrackingKpiCardClass,
  projectTrackingKpiLabelClass,
  projectTrackingMetaBarClass,
  projectTrackingPanelClass,
  projectTrackingProgressFillClass,
  projectTrackingProgressFillTasksClass,
  projectTrackingProgressTrackClass,
  projectTrackingShellClass,
  projectTrackingStatusBadgeClass,
  projectTrackingTagClass,
} from './project-ui'
import { taskDayDiffFromToday } from './project-task-card-ui'
import { type ResponsibleOption } from './project-workspace-helpers'

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
  projectDetailsOpen?: boolean
  onToggleProjectDetails?: () => void
  savingOverview?: boolean
  dirtyOverview?: boolean
  onProjectChange?: Dispatch<SetStateAction<ProjectData>>
  onSaveOverview?: () => void
  onResolveAlert?: (target: TrackingAlertTarget) => void
  onOpenBlock?: (blockId: string) => void
  onOpenTask?: (blockId: string, taskId: string) => void
}

type FlatTask = ProjectData['blocks'][number]['tasks'][number] & {
  blockId: string
  blockName: string
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const dayDiffFromToday = taskDayDiffFromToday

const toPercent = (value: number, total: number) => {
  if (total <= 0) return 0
  return Math.round((value / total) * 100)
}

const deadlineHint = (daysLeft: number | null) => {
  if (daysLeft === null) return '--'
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
  if (value === 'done') return 'border border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value === 'blocked') return 'border border-rose-200 bg-rose-50 text-rose-800'
  if (value === 'overdue') return 'border border-amber-200 bg-amber-50 text-amber-900'
  if (value === 'in_progress') return 'border border-sky-200 bg-sky-50 text-sky-800'
  return 'border border-slate-200 bg-slate-50 text-slate-700'
}

const taskStatusClass = (value: string) => {
  if (value === 'done') return 'border border-emerald-200 bg-emerald-50 text-emerald-800'
  if (value === 'blocked') return 'border border-rose-200 bg-rose-50 text-rose-800'
  if (value === 'in_progress') return 'border border-sky-200 bg-sky-50 text-sky-800'
  return 'border border-slate-200 bg-slate-50 text-slate-700'
}

function SectionHeader({
  icon,
  title,
  subtitle,
  action,
  collapsible = false,
  expanded = true,
  onToggle,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const titleBlock = (
    <>
      <h2 className={projectOverviewSectionTitleClass}>{title}</h2>
      {subtitle ? <p className={projectOverviewSectionSubtitleClass}>{subtitle}</p> : null}
    </>
  )

  return (
    <div className="mb-4 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={expanded ? 'Plegar secci�' : 'Desplegar secci�'}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={cn(projectTrackingIconBoxClass, 'h-9 w-9')}>{icon}</div>
          <div className="min-w-0">
            {collapsible ? (
              <button type="button" onClick={onToggle} className="w-full text-left">
                {titleBlock}
              </button>
            ) : (
              titleBlock
            )}
          </div>
        </div>
      </div>
      {action ? (
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">{action}</div>
      ) : null}
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
        'flex items-start gap-3 px-4 py-3 sm:px-5',
        'border-b border-slate-200 last:border-b-0',
        'border-l-[3px] bg-white',
        alert.tone === 'rose' ? 'border-l-rose-500' : 'border-l-amber-500'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm',
          alert.tone === 'rose' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
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
            <div className="text-sm font-medium leading-snug text-slate-900 group-hover:text-violet-800">
              {alert.title}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {alert.detail ? <span className="text-xs text-slate-500">{alert.detail}</span> : null}
              <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700">
                {alert.actionLabel}
                <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </button>
        ) : (
          <>
            <div className="text-sm font-medium text-slate-900">{alert.title}</div>
            {alert.detail ? <p className="mt-0.5 text-xs text-slate-500">{alert.detail}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}

function BlockTrackingCard({
  block,
  onOpen,
}: {
  block: ProjectData['blocks'][number]
  onOpen?: (blockId: string) => void
}) {
  const blockTasks = block.tasks || []
  const doneTasks = blockTasks.filter((task) => task.status === 'done').length
  const overdueBlockTasks = blockTasks.filter(
    (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
  ).length
  const deadlineCountdown = dayDiffFromToday(block.deadline)
  const progress = toPercent(doneTasks, blockTasks.length)
  const departments = getBlockDepartments(block)

  const content = (
    <>
      <span className={projectTrackingCardAccentClass} aria-hidden />
      <div className="pl-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                projectCardTitleClass,
                'text-sm',
                onOpen && 'cursor-pointer group-hover:text-violet-800'
              )}
            >
              {block.name}
            </div>
            <div className={cn(projectCardMetaClass, 'overview-body-copy mt-1 text-xs')}>
              {block.owner || '--'} · {formatProjectDate(block.deadline) || '--'}
            </div>
          </div>
          <span className={cn(projectTrackingStatusBadgeClass, blockStatusClass(block.status))}>
            {blockStatusLabel(block.status)}
          </span>
        </div>

        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              {doneTasks}/{blockTasks.length} tasques
            </span>
            <span className="font-semibold tabular-nums text-slate-700">{progress}%</span>
          </div>
          <div className={projectTrackingProgressTrackClass}>
            <div className={projectTrackingProgressFillClass} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-2 flex min-h-[24px] flex-wrap gap-1">
          {departments.map((department) => (
            <span
              key={`${block.id}-${department}`}
              className={cn(
                projectTrackingTagClass,
                projectOverviewChipClass,
                colorByDepartment(department)
              )}
            >
              <span className="truncate">{department}</span>
            </span>
          ))}
          {overdueBlockTasks > 0 ? (
            <span className={cn(projectTrackingTagClass, 'border border-rose-200 bg-rose-50 text-rose-700')}>
              {overdueBlockTasks} vencudes
            </span>
          ) : (
            <span className={cn(projectTrackingTagClass, 'border border-slate-200 text-slate-500')}>
              {deadlineHint(deadlineCountdown)}
            </span>
          )}
        </div>
      </div>
    </>
  )

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(block.id)}
        className={cn(projectTrackingCardClass, 'group w-full text-left')}
      >
        {content}
      </button>
    )
  }

  return <div className={projectTrackingCardClass}>{content}</div>
}

function TaskTrackingCard({ task, onOpen }: { task: FlatTask; onOpen?: (blockId: string, taskId: string) => void }) {
  const taskDeadline = dayDiffFromToday(task.deadline)
  const priorityLabel =
    task.priority === 'critical'
            ? 'Critica'
      : task.priority === 'high'
        ? 'Alta'
        : task.priority === 'low'
          ? 'Baixa'
          : 'Normal'

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(task.blockId, task.id)}
        className={cn(projectTrackingCardClass, 'group w-full text-left')}
      >
        <span className={projectTrackingCardAccentClass} aria-hidden />
        <div className="pl-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className={cn(projectCardTitleClass, 'text-sm', 'cursor-pointer group-hover:text-violet-800')}>
                {task.title}
              </div>
              <div className={cn(projectCardMetaClass, 'overview-body-copy mt-1 truncate text-xs whitespace-nowrap')}>
                {task.blockName} - {task.owner || '--'}
              </div>
            </div>
            <span className={cn(projectTrackingStatusBadgeClass, taskStatusClass(task.status))}>
              {taskStatusLabel(task.status)}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            <span
              className={cn(
                projectTrackingTagClass,
                task.priority === 'critical'
                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                  : task.priority === 'high'
                    ? 'border border-amber-200 bg-amber-50 text-amber-800'
                    : 'border border-violet-200 bg-violet-50 text-violet-700'
              )}
            >
              {priorityLabel}
            </span>
            {task.department ? (
              <span
                className={cn(
                  projectTrackingTagClass,
                  projectOverviewChipClass,
                  colorByDepartment(task.department)
                )}
              >
                <span className="truncate">{task.department}</span>
              </span>
            ) : null}
            <span
              className={cn(
                projectTrackingTagClass,
                'border',
                taskDeadline !== null && taskDeadline < 0 && task.status !== 'done'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-slate-200 text-slate-500'
              )}
            >
              {formatProjectDate(task.deadline)} - {deadlineHint(taskDeadline)}
            </span>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className={projectTrackingCardClass}>
      <span className={projectTrackingCardAccentClass} aria-hidden />
      <div className="pl-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className={cn(projectCardTitleClass, 'text-sm', onOpen && 'cursor-pointer group-hover:text-violet-800')}>
              {task.title}
            </div>
            <div className={cn(projectCardMetaClass, 'overview-body-copy mt-1 truncate text-xs whitespace-nowrap')}>
              {task.blockName} - {task.owner || '--'}
            </div>
          </div>
          <span className={cn(projectTrackingStatusBadgeClass, taskStatusClass(task.status))}>
            {taskStatusLabel(task.status)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <span
            className={cn(
              projectTrackingTagClass,
              task.priority === 'critical'
                ? 'border border-rose-200 bg-rose-50 text-rose-700'
                : task.priority === 'high'
                  ? 'border border-amber-200 bg-amber-50 text-amber-800'
                  : 'border border-violet-200 bg-violet-50 text-violet-700'
            )}
          >
            {priorityLabel}
          </span>
          {task.department ? (
            <span
              className={cn(
                projectTrackingTagClass,
                projectOverviewChipClass,
                colorByDepartment(task.department)
              )}
            >
              <span className="truncate">{task.department}</span>
            </span>
          ) : null}
          <span
            className={cn(
              projectTrackingTagClass,
              'border',
              taskDeadline !== null && taskDeadline < 0 && task.status !== 'done'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 text-slate-500'
            )}
          >
            {formatProjectDate(task.deadline)} - {deadlineHint(taskDeadline)}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ProjectTrackingTab({
  project,
  ownerOptions,
  canManageProject = false,
  projectDetailsOpen = false,
  onToggleProjectDetails,
  savingOverview = false,
  dirtyOverview = false,
  onProjectChange,
  onSaveOverview,
  onResolveAlert,
  onOpenBlock,
  onOpenTask,
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
      detail: `Bloc ${task.blockName} - ${formatProjectDate(task.deadline)}`,
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
  const [blocksExpanded, setBlocksExpanded] = useState(true)
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const involvedDepartments = new Set(
    project.blocks.flatMap((block) => getBlockDepartments(block))
  )
  const blocksProgress = toPercent(completedBlocks, project.blocks.length)
  const tasksProgress = toPercent(completedTasks, allTasks.length)

  return (
    <div className="w-full min-w-0 space-y-6 md:space-y-8">
      {canManageProject && projectDetailsOpen ? (
        <section className={projectTrackingPanelClass}>
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <div className={cn(projectTrackingIconBoxClass, 'h-9 w-9')}>
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h2 className={projectOverviewSectionTitleClass}>Dades del projecte</h2>
                <p className={projectOverviewSectionSubtitleClass}>Edita responsable, inici, arrencada i data limit.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={onSaveOverview}
                disabled={!dirtyOverview || savingOverview}
                className={projectPrimaryButtonClass}
              >
                <Save className="h-3.5 w-3.5" />
                {savingOverview ? 'Guardant...' : 'Guardar dades'}
              </Button>
              {onToggleProjectDetails ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={onToggleProjectDetails}
                  title="Tancar dades del projecte"
                  aria-label="Tancar dades del projecte"
                  className="h-9 w-9 border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4 lg:p-6">
            <div className="space-y-2">
              <Label htmlFor="tracking-project-owner" className={projectOverviewLabelClass}>
                Responsable del projecte
              </Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="tracking-project-start" className={projectOverviewLabelClass}>
                Data d'inici
              </Label>
              <Input
                id="tracking-project-start"
                type="date"
                value={project.startDate || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({ ...current, startDate: event.target.value }))
                }
                className={projectOverviewInputClass}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tracking-project-kickoff" className={projectOverviewLabelClass}>
                Arrencada
              </Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="tracking-project-deadline" className={projectOverviewLabelClass}>
                Deadline del projecte
              </Label>
              <Input
                id="tracking-project-deadline"
                type="date"
                value={project.launchDate || ''}
                onChange={(event) =>
                  onProjectChange?.((current) => ({ ...current, launchDate: event.target.value }))
                }
                className={projectOverviewInputClass}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section>


        <div className={projectTrackingShellClass}>
          <div className={projectTrackingMetaBarClass}>
            <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600', projectOverviewMetaClass)}>
              <span>
                <span className="font-semibold tabular-nums text-slate-900">{completedBlocks}</span>/{project.blocks.length} blocs
              </span>
              <span className="text-slate-300">-</span>
              <span>
                <span className="font-semibold tabular-nums text-slate-900">{completedTasks}</span>/{allTasks.length} tasques
              </span>
              <span className="text-slate-300">-</span>
              <span>
                Arrencada <span className="font-semibold text-slate-900">{formatProjectDate(project.launchDate)}</span>
              </span>
              <span className="hidden text-slate-300 sm:inline">-</span>
              <span className="hidden sm:inline">
                {launchCountdown === null
                  ? 'Sense comptador'
                  : launchCountdown > 0
                    ? `Falten ${launchCountdown} dies`
                    : launchCountdown === 0
                      ? 'Venc avui'
                      : `Retard de ${Math.abs(launchCountdown)} dies`}
              </span>
            </div>

            <div className="mt-3 grid divide-y divide-slate-200 border border-slate-200 sm:mt-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <div className={projectTrackingKpiCardClass}>
                <div className={projectTrackingKpiLabelClass}>Progres blocs</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{blocksProgress}%</div>
                <div className={cn(projectTrackingProgressTrackClass, 'mt-2')}>
                  <div className={projectTrackingProgressFillClass} style={{ width: `${blocksProgress}%` }} />
                </div>
              </div>
              <div className={projectTrackingKpiCardClass}>
                <div className={projectTrackingKpiLabelClass}>Progres tasques</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{tasksProgress}%</div>
                <div className={cn(projectTrackingProgressTrackClass, 'mt-2')}>
                  <div className={projectTrackingProgressFillTasksClass} style={{ width: `${tasksProgress}%` }} />
                </div>
              </div>
              <div className={projectTrackingKpiCardClass}>
                <div className={projectTrackingKpiLabelClass}>Assignacions pendents</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{pendingAssignments}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {blocksWithoutOwner.length} blocs - {tasksWithoutOwner.length} tasques
                </div>
              </div>
              <div className={projectTrackingKpiCardClass}>
                <div className={projectTrackingKpiLabelClass}>Alertes obertes</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{alerts.length}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {alerts.length > 0 ? 'Requereixen accio' : 'Cap incidencia pendent'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <section>
        <SectionHeader
          icon={<Layers className="h-4 w-4" />}
          title="Seguiment de blocs"
          collapsible
          expanded={blocksExpanded}
          onToggle={() => setBlocksExpanded((current) => !current)}
        />

        {blocksExpanded ? (
          <div className={projectTrackingShellClass}>
            <div className={projectTrackingMetaBarClass}>
              <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600', projectOverviewMetaClass)}>
                <span>
                  <span className="font-semibold text-slate-700">{project.blocks.length}</span> bloc
                  {project.blocks.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">-</span>
                <span>
                  <span className="font-semibold text-slate-700">{involvedDepartments.size}</span> departament
                  {involvedDepartments.size === 1 ? '' : 's'} implicat
                  {involvedDepartments.size === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">-</span>
                <span>
                  <span className="font-semibold text-slate-700">{blocksProgress}%</span> completat
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5 lg:p-6">
              {project.blocks.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {project.blocks.map((block) => (
                    <BlockTrackingCard key={block.id} block={block} onOpen={onOpenBlock} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <div className={cn(projectTrackingIconBoxClass, 'h-10 w-10')}>
                    <Layers className="h-5 w-5" />
                  </div>
                  <p className="overview-body-copy mt-3 font-medium text-slate-700">Encara no hi ha blocs</p>
                  <p className={cn('overview-body-copy mt-1 max-w-sm', projectEmptyStateClass)}>
                    Quan s&apos;afegeixin blocs al projecte, apareixeran aqui amb el seu estat i progres.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeader
          icon={<ListTodo className="h-4 w-4" />}
          title="Seguiment de tasques"
          collapsible
          expanded={tasksExpanded}
          onToggle={() => setTasksExpanded((current) => !current)}
        />

        {tasksExpanded ? (
          <div className={projectTrackingShellClass}>
            <div className={projectTrackingMetaBarClass}>
              <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600', projectOverviewMetaClass)}>
                <span>
                  <span className="font-semibold text-slate-700">{allTasks.length}</span> tasca
                  {allTasks.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">-</span>
                <span>
                  <span className="font-semibold text-slate-700">{completedTasks}</span> fetes
                </span>
                <span className="text-slate-300">-</span>
                <span>
                  <span className="font-semibold text-slate-700">{overdueTasks.length}</span> vencudes
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5 lg:p-6">
              {allTasks.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {allTasks.map((task) => (
                    <TaskTrackingCard
                      key={`${task.blockId}:${task.id}`}
                      task={task}
                      onOpen={onOpenTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <div className={cn(projectTrackingIconBoxClass, 'h-10 w-10')}>
                    <ListTodo className="h-5 w-5" />
                  </div>
                  <p className="overview-body-copy mt-3 font-medium text-slate-700">Encara no hi ha tasques</p>
                  <p className={cn('overview-body-copy mt-1 max-w-sm', projectEmptyStateClass)}>
                    Les tasques del projecte apareixeran aqui amb el seu estat i progres.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
      </div>

      <section>
        <SectionHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Alertes"
          collapsible
          expanded={alertsExpanded}
          onToggle={() => setAlertsExpanded((current) => !current)}
          action={
            <span
              className={cn(
                'rounded px-2.5 py-1 text-xs font-semibold',
                alerts.length > 0
                  ? 'border border-amber-200 bg-amber-50 text-amber-900'
                  : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              )}
            >
              {alerts.length > 0 ? `${alerts.length} obertes` : 'Tot en ordre'}
            </span>
          }
        />

        {alertsExpanded ? (
          <div className={projectTrackingPanelClass}>
            <div className="divide-y divide-slate-200">
              {alerts.length > 0 ? (
                alerts.map((alert) => (
                  <TrackingAlertRow key={alert.key} alert={alert} onResolve={onResolveAlert} />
                ))
              ) : (
                <div className="flex items-center gap-3 border-l-[3px] border-l-emerald-500 px-4 py-4 text-sm text-slate-700 sm:px-5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  No hi ha alertes obertes. El seguiment del projecte esta al dia.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}


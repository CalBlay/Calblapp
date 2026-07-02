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
  projectBlockCardAccentClass,
  projectBlockCardClass,
  projectCardMetaClass,
  projectCardTitleClass,
  projectEmptyIconClass,
  projectEmptyShellClass,
  projectEmptyStateClass,
  projectIconBoxClass,
  projectMetaStripClass,
  projectModuleShellClass,
  projectOverviewChipClass,
  projectOverviewInputClass,
  projectOverviewLabelClass,
  projectOverviewMetaClass,
  projectOverviewSectionLabelClass,
  projectOverviewSectionSubtitleClass,
  projectOverviewSectionTitleClass,
  projectOverviewSelectClass,
  projectPanelClass,
  projectPrimaryButtonClass,
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

const dayDiffFromToday = taskDayDiffFromToday

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
  if (value === 'done') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
  if (value === 'blocked') return 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
  if (value === 'overdue') return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  if (value === 'in_progress') return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  return 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
}

const taskStatusClass = (value: string) => {
  if (value === 'done') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
  if (value === 'blocked') return 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
  if (value === 'in_progress') return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
  return 'bg-sky-100 text-sky-800 ring-1 ring-sky-200'
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
  subtitle: string
  action?: ReactNode
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const titleBlock = (
    <>
      <h2 className={projectOverviewSectionTitleClass}>{title}</h2>
      <p className={projectOverviewSectionSubtitleClass}>{subtitle}</p>
    </>
  )

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={expanded ? 'Plegar secció' : 'Desplegar secció'}
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className={cn(projectIconBoxClass, 'h-10 w-10')}>{icon}</div>
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
        'flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm transition',
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
      <span className={projectBlockCardAccentClass} aria-hidden />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                projectCardTitleClass,
                onOpen && 'group-hover:text-violet-700 group-hover:underline'
              )}
            >
              {block.name}
            </div>
            <div className={cn(projectCardMetaClass, 'overview-body-copy mt-1')}>
              {block.owner || 'Sense responsable'} · {formatProjectDate(block.deadline)}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              blockStatusClass(block.status)
            )}
          >
            {blockStatusLabel(block.status)}
          </span>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {doneTasks}/{blockTasks.length} tasques
            </span>
            <span className="font-semibold text-slate-700">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-2 flex min-h-[28px] flex-wrap gap-1.5">
          {departments.map((department) => (
            <span
              key={`${block.id}-${department}`}
              className={cn(
                'inline-flex max-w-full items-center rounded-full px-2.5 py-1',
                projectOverviewChipClass,
                colorByDepartment(department)
              )}
            >
              <span className="truncate">{department}</span>
            </span>
          ))}
          {overdueBlockTasks > 0 ? (
            <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-medium text-rose-700 ring-1 ring-rose-200">
              {overdueBlockTasks} vencudes
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-dashed border-slate-200 px-2.5 py-1 text-[11px] text-slate-400">
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
        className={cn(projectBlockCardClass, 'group w-full text-left')}
      >
        {content}
      </button>
    )
  }

  return <div className={projectBlockCardClass}>{content}</div>
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
    <div className={projectBlockCardClass}>
      <span className={projectBlockCardAccentClass} aria-hidden />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className={projectCardTitleClass}>{task.title}</div>
            <div className={cn(projectCardMetaClass, 'overview-body-copy mt-1')}>
              {task.blockName} · {task.owner || 'Sense responsable'}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
              taskStatusClass(task.status)
            )}
          >
            {taskStatusLabel(task.status)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ring-1',
              task.priority === 'critical'
                ? 'bg-rose-100 text-rose-700 ring-rose-200'
                : task.priority === 'high'
                  ? 'bg-amber-100 text-amber-800 ring-amber-200'
                  : 'bg-violet-100 text-violet-700 ring-violet-200'
            )}
          >
            {priorityLabel}
          </span>
          {task.department ? (
            <span
              className={cn(
                'inline-flex max-w-full items-center rounded-full px-2.5 py-1',
                projectOverviewChipClass,
                colorByDepartment(task.department)
              )}
            >
              <span className="truncate">{task.department}</span>
            </span>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center rounded-full border border-dashed px-2.5 py-1 text-[11px]',
              taskDeadline !== null && taskDeadline < 0 && task.status !== 'done'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-slate-200 text-slate-500'
            )}
          >
            {formatProjectDate(task.deadline)} · {deadlineHint(taskDeadline)}
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
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [blocksExpanded, setBlocksExpanded] = useState(true)
  const [tasksExpanded, setTasksExpanded] = useState(true)
  const [alertsExpanded, setAlertsExpanded] = useState(true)
  const involvedDepartments = new Set(
    project.blocks.flatMap((block) => getBlockDepartments(block))
  )
  const blocksProgress = toPercent(completedBlocks, project.blocks.length)
  const tasksProgress = toPercent(completedTasks, allTasks.length)

  return (
    <div className="w-full min-w-0 space-y-8 md:space-y-10">
      {canManageProject ? (
        <section>
          <SectionHeader
            icon={<FileText className="h-4 w-4" />}
            title="Dades del projecte"
            subtitle="Edita responsable, inici, arrencada i data límit des d'aquí."
            collapsible
            expanded={detailsExpanded}
            onToggle={() => setDetailsExpanded((current) => !current)}
            action={
              detailsExpanded ? (
                <Button
                  type="button"
                  onClick={onSaveOverview}
                  disabled={!dirtyOverview || savingOverview}
                  className={projectPrimaryButtonClass}
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingOverview ? 'Guardant...' : 'Guardar dades'}
                </Button>
              ) : null
            }
          />

          {detailsExpanded ? (
            <div className={projectPanelClass}>
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
            </div>
          ) : null}
        </section>
      ) : null}

      <section>
        <SectionHeader
          icon={<FolderKanban className="h-4 w-4" />}
          title="Resum del projecte"
          subtitle="Indicadors clau de progrés, dates i incidències pendents."
        />

        <div className={projectModuleShellClass}>
          <div className={cn(projectMetaStripClass, 'px-4 py-3 sm:px-5 lg:px-6')}>
            <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500', projectOverviewMetaClass)}>
              <span>
                <span className="font-semibold text-slate-700">{completedBlocks}</span>/{project.blocks.length} blocs
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <span className="font-semibold text-slate-700">{completedTasks}</span>/{allTasks.length} tasques
              </span>
              <span className="text-slate-300">·</span>
              <span>
                Arrencada <span className="font-semibold text-slate-700">{formatProjectDate(project.launchDate)}</span>
              </span>
              <span className="hidden text-slate-300 sm:inline">·</span>
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

            <div className="mt-3 grid gap-3 border-t border-violet-100/70 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-violet-100/60 bg-white/80 px-3 py-2.5">
                <div className={projectOverviewSectionLabelClass}>Progrés blocs</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{blocksProgress}%</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    style={{ width: `${blocksProgress}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-violet-100/60 bg-white/80 px-3 py-2.5">
                <div className={projectOverviewSectionLabelClass}>Progrés tasques</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{tasksProgress}%</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    style={{ width: `${tasksProgress}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-violet-100/60 bg-white/80 px-3 py-2.5">
                <div className={projectOverviewSectionLabelClass}>Assignacions pendents</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{pendingAssignments}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {blocksWithoutOwner.length} blocs · {tasksWithoutOwner.length} tasques
                </div>
              </div>
              <div className="rounded-xl border border-violet-100/60 bg-white/80 px-3 py-2.5">
                <div className={projectOverviewSectionLabelClass}>Alertes obertes</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{alerts.length}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {alerts.length > 0 ? 'Requereixen acció' : 'Cap incidència pendent'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionHeader
          icon={<Layers className="h-4 w-4" />}
          title="Seguiment de blocs"
          subtitle="Vista resum de cada bloc i del seu progrés, amb el mateix criteri visual que l'estructura del projecte."
          collapsible
          expanded={blocksExpanded}
          onToggle={() => setBlocksExpanded((current) => !current)}
        />

        {blocksExpanded ? (
          <div className={projectModuleShellClass}>
            <div className={cn(projectMetaStripClass, 'px-4 py-3 sm:px-5 lg:px-6')}>
              <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500', projectOverviewMetaClass)}>
                <span>
                  <span className="font-semibold text-slate-700">{project.blocks.length}</span> bloc
                  {project.blocks.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <span className="font-semibold text-slate-700">{involvedDepartments.size}</span> departament
                  {involvedDepartments.size === 1 ? '' : 's'} implicat
                  {involvedDepartments.size === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <span className="font-semibold text-slate-700">{blocksProgress}%</span> completat
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5 lg:p-6">
              {project.blocks.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {project.blocks.map((block) => (
                    <BlockTrackingCard key={block.id} block={block} onOpen={onOpenBlock} />
                  ))}
                </div>
              ) : (
                <div className={projectEmptyShellClass}>
                  <div className={projectEmptyIconClass}>
                    <Layers className="h-5 w-5" />
                  </div>
                  <p className="overview-body-copy mt-4 font-medium text-slate-700">Encara no hi ha blocs</p>
                  <p className={cn('overview-body-copy mt-1 max-w-sm', projectEmptyStateClass)}>
                    Quan s&apos;afegeixin blocs al projecte, els veuràs aquí amb el mateix format que a la creació.
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
          subtitle="Resum ràpid de les tasques obertes i del seu estat actual."
          collapsible
          expanded={tasksExpanded}
          onToggle={() => setTasksExpanded((current) => !current)}
        />

        {tasksExpanded ? (
          <div className={projectModuleShellClass}>
            <div className={cn(projectMetaStripClass, 'px-4 py-3 sm:px-5 lg:px-6')}>
              <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500', projectOverviewMetaClass)}>
                <span>
                  <span className="font-semibold text-slate-700">{allTasks.length}</span> tasca
                  {allTasks.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <span className="font-semibold text-slate-700">{completedTasks}</span> fetes
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  <span className="font-semibold text-slate-700">{overdueTasks.length}</span> vencudes
                </span>
              </div>
            </div>

            <div className="space-y-4 p-4 sm:p-5 lg:p-6">
              {allTasks.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {allTasks.map((task) => (
                    <TaskTrackingCard key={`${task.blockId}:${task.id}`} task={task} />
                  ))}
                </div>
              ) : (
                <div className={projectEmptyShellClass}>
                  <div className={projectEmptyIconClass}>
                    <ListTodo className="h-5 w-5" />
                  </div>
                  <p className="overview-body-copy mt-4 font-medium text-slate-700">Encara no hi ha tasques</p>
                  <p className={cn('overview-body-copy mt-1 max-w-sm', projectEmptyStateClass)}>
                    Les tasques del projecte apareixeran aquí en targetes compactes.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeader
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Alertes"
          subtitle="Clica una alerta per resoldre-la. Després de guardar, desapareix d'aquesta llista."
          collapsible
          expanded={alertsExpanded}
          onToggle={() => setAlertsExpanded((current) => !current)}
          action={
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-bold',
                alerts.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
              )}
            >
              {alerts.length > 0 ? `${alerts.length} obertes` : 'Tot en ordre'}
            </span>
          }
        />

        {alertsExpanded ? (
          <div className={projectPanelClass}>
            <div className="space-y-2 p-4 sm:p-5 lg:p-6">
              {alerts.length > 0 ? (
                alerts.map((alert) => (
                  <TrackingAlertRow key={alert.key} alert={alert} onResolve={onResolveAlert} />
                ))
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  No hi ha alertes obertes. El seguiment del projecte està al dia.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

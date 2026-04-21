'use client'

import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, FolderKanban } from 'lucide-react'
import {
  formatProjectDate,
  getBlockDepartments,
  phaseLabel,
  type ProjectData,
} from './project-shared'
import { projectCardMetaClass, projectCardTitleClass, projectEmptyStateClass, projectSectionTitleClass } from './project-ui'

type Props = {
  project: ProjectData
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
  return 'bg-slate-100 text-slate-700'
}

export default function ProjectTrackingTab({ project }: Props) {
  const launchCountdown = dayDiffFromToday(project.launchDate)
  const allTasks = project.blocks.flatMap((block) =>
    block.tasks.map((task) => ({
      ...task,
      blockId: block.id,
      blockName: block.name,
    }))
  )
  const totalBudget = project.blocks.reduce((sum, block) => {
    const parsed = Number(String(block.budget || '').replace(',', '.'))
    return Number.isFinite(parsed) ? sum + parsed : sum
  }, 0)

  const completedBlocks = project.blocks.filter((block) => block.status === 'done').length
  const completedTasks = allTasks.filter((task) => task.status === 'done').length
  const blockedBlocks = project.blocks.filter((block) => block.status === 'blocked')
  const overdueBlocks = project.blocks.filter((block) => block.status === 'overdue')
  const blockedTasks = allTasks.filter((task) => task.status === 'blocked')
  const overdueTasks = allTasks.filter(
    (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
  )
  const criticalTasks = allTasks.filter(
    (task) => task.priority === 'critical' && task.status !== 'done'
  )
  const blocksWithoutOwner = project.blocks.filter((block) => !block.owner.trim())
  const tasksWithoutOwner = allTasks.filter((task) => !task.owner.trim())
  const roomsWithoutActivity = project.rooms.filter(
    (room) => (room.messages || []).length === 0 && (room.documents || []).length === 0
  )
  const tasksWithDependencies = allTasks.filter((task) => String(task.dependsOn || '').trim())
  const blockedByDependencyTasks = allTasks.filter((task) => {
    const dependencyId = String(task.dependsOn || '').trim()
    if (!dependencyId || task.status === 'done') return false
    const dependencyTask = allTasks.find((item) => item.id === dependencyId)
    if (!dependencyTask) return false
    return dependencyTask.status !== 'done'
  })
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
  const closedSprintStats = sprintStats.filter((item) => item.sprint.status === 'closed')
  const averageVelocity =
    closedSprintStats.length > 0
      ? Math.round(
          closedSprintStats.reduce((sum, item) => sum + item.completedPoints, 0) / closedSprintStats.length
        )
      : 0

  const alerts = [
    ...blockedBlocks.map((block) => ({
      key: `block-blocked-${block.id}`,
      text: `Bloc bloquejat: ${block.name}`,
      tone: 'rose' as const,
    })),
    ...overdueBlocks.map((block) => ({
      key: `block-overdue-${block.id}`,
      text: `Bloc en retard: ${block.name}`,
      tone: 'amber' as const,
    })),
    ...overdueTasks.map((task) => ({
      key: `task-overdue-${task.id}`,
      text: `Tasca vencuda: ${task.title} · ${task.blockName}`,
      tone: 'amber' as const,
    })),
    ...criticalTasks.map((task) => ({
      key: `task-critical-${task.id}`,
      text: `Tasca critica oberta: ${task.title} · ${task.blockName}`,
      tone: 'rose' as const,
    })),
    ...blocksWithoutOwner.map((block) => ({
      key: `block-owner-${block.id}`,
      text: `Bloc sense responsable: ${block.name}`,
      tone: 'amber' as const,
    })),
    ...tasksWithoutOwner.map((task) => ({
      key: `task-owner-${task.id}`,
      text: `Tasca sense responsable: ${task.title}`,
      tone: 'amber' as const,
    })),
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FolderKanban className="h-4 w-4" />
            Fase actual
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{phaseLabel(project.phase)}</div>
        </div>

        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4" />
            Blocs completats
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            {completedBlocks}/{project.blocks.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {toPercent(completedBlocks, project.blocks.length)}%
          </div>
        </div>

        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 className="h-4 w-4" />
            Tasques completes
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            {completedTasks}/{allTasks.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">{toPercent(completedTasks, allTasks.length)}%</div>
        </div>

        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarClock className="h-4 w-4" />
            Arrencada
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            {formatProjectDate(project.launchDate)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {launchCountdown === null
              ? 'Sense comptador'
              : launchCountdown > 0
                ? `Falten ${launchCountdown} dies`
                : launchCountdown === 0
                  ? 'Arrencada avui'
                  : `Retard de ${Math.abs(launchCountdown)} dies`}
          </div>
        </div>

        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FolderKanban className="h-4 w-4" />
            Cost acumulat
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            {totalBudget.toLocaleString('ca-ES')} EUR
          </div>
          <div className="mt-1 text-xs text-slate-500">Suma dels blocs</div>
        </div>

        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Clock3 className="h-4 w-4" />
            Estat critic
          </div>
          <div className="mt-2 text-xl font-semibold text-slate-900">
            {blockedBlocks.length + blockedTasks.length + overdueTasks.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {blockedBlocks.length} blocs · {overdueTasks.length} tasques vencudes
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="text-sm text-slate-500">Sprint actiu</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {activeSprintStat?.sprint.name || 'Sense sprint actiu'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {(activeSprintStat?.sprintTasks.length || 0)} tasques
          </div>
        </div>
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="text-sm text-slate-500">Compromes / completat</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {activeSprintStat ? `${activeSprintStat.committedPoints} / ${activeSprintStat.completedPoints} SP` : '0 / 0 SP'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {activeSprintStat ? `${activeSprintStat.completionRate}%` : 'Sense dades'}
          </div>
        </div>
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="text-sm text-slate-500">Velocity mitjana</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{averageVelocity} SP</div>
          <div className="mt-1 text-xs text-slate-500">{closedSprintStats.length} sprints tancats</div>
        </div>
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="text-sm text-slate-500">Dependencies</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{tasksWithDependencies.length}</div>
          <div className="mt-1 text-xs text-slate-500">tasques amb dependencia</div>
        </div>
        <div className="rounded-[24px] bg-white/75 p-5">
          <div className="text-sm text-slate-500">Spillover sprint</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {activeSprintStat?.spilledTasks || 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">tasques no completades</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[24px] bg-white/75 p-5">
          <div className={`flex items-center gap-2 ${projectSectionTitleClass}`}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Alertes
          </div>

          {alerts.length > 0 ? (
            <div className="mt-4 space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.key}
                  className={`rounded-2xl px-4 py-3 text-sm ${
                    alert.tone === 'rose'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              No hi ha alertes obertes.
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Sales sense activitat</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{roomsWithoutActivity.length}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Tasques critiques</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{criticalTasks.length}</div>
            </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-400">Bloquejades per dependencia</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{blockedByDependencyTasks.length}</div>
              </div>
          </div>
        </section>

        <section className="rounded-[24px] bg-white/75 p-5">
          <div className={projectSectionTitleClass}>Seguiment per blocs</div>

          {project.blocks.length > 0 ? (
            <div className="mt-4 space-y-3">
              {project.blocks.map((block) => {
                const blockTasks = block.tasks || []
                const doneTasks = blockTasks.filter((task) => task.status === 'done').length
                const overdueBlockTasks = blockTasks.filter(
                  (task) => task.deadline && task.deadline < todayKey() && task.status !== 'done'
                ).length
                const deadlineCountdown = dayDiffFromToday(block.deadline)

                return (
                  <div key={block.id} className="rounded-2xl bg-slate-50/75 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={projectCardTitleClass}>{block.name}</div>
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
                          {block.dependsOn ? (
                            <>
                              <span>·</span>
                              <span>
                                Depen de{' '}
                                {project.blocks.find((item) => item.id === block.dependsOn)?.name || block.dependsOn}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${blockStatusClass(block.status)}`}>
                        {blockStatusLabel(block.status)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      <div className={`rounded-2xl px-3 py-2 ${blockDeadlineClass(deadlineCountdown)}`}>
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Data limit</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {formatProjectDate(block.deadline)}
                        </div>
                        <div className="mt-1 text-xs">{blockDeadlineHint(deadlineCountdown)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Tasques</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{blockTasks.length}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Completat</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">
                          {toPercent(doneTasks, blockTasks.length)}%
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Vencudes</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900">{overdueBlockTasks}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Estat tasques</div>
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
            <div className={`mt-4 rounded-2xl bg-slate-50/80 px-4 py-4 ${projectEmptyStateClass}`}>
              Encara no hi ha blocs creats.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

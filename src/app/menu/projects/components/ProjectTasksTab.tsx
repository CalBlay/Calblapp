'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, MessagesSquare, Paperclip, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FilterButton from '@/components/ui/filter-button'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFilters } from '@/context/FiltersContext'
import { colorByDepartment } from '@/lib/colors'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SCRUM_STORY_POINT_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  formatProjectDate,
  getPreLaunchDeadline,
  type ProjectDocument,
  type ProjectBlock,
  type ProjectSprint,
  type ProjectTask,
} from './project-shared'
import ProjectTaskQuickComposer from './ProjectTaskQuickComposer'
import {
  projectEmptyStateClass,
  projectSectionSubtitleClass,
  projectSectionTitleClass,
} from './project-ui'
import { type ResponsibleOption } from './project-workspace-helpers'

type TaskDraft = {
  blockId: string
  title: string
  description: string
  department: string
  owner: string
  deadline: string
  dependsOn: string
  sprintId: string
  storyPoints: string
  priority: string
}

type TaskEntry = {
  block: ProjectBlock
  task: ProjectTask
  taskKey: string
}

type Props = {
  projectId: string
  projectBlocks: ProjectBlock[]
  projectSprints: ProjectSprint[]
  projectRooms: Array<{ id: string; blockId?: string; kind: 'block' | 'manual' }>
  allTasks: TaskEntry[]
  taskDraft: TaskDraft
  showTaskComposer: boolean
  editingTaskKey: string | null
  savingBlocks: boolean
  dirtyBlocks: boolean
  onSave: () => void
  onResetTaskDraft: () => void
  onSetTaskDraftField: <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => void
  onAddTaskToBlock: (blockId: string) => void
  onSetEditingTaskKey: (value: string | null | ((current: string | null) => string | null)) => void
  onRemoveTask: (blockId: string, taskId: string) => void
  onSetTaskField: <K extends keyof ProjectTask>(
    blockId: string,
    taskId: string,
    field: K,
    value: ProjectTask[K]
  ) => void
  onAttachTaskDocument: (blockId: string, taskId: string, file: File) => void
  onRemoveTaskDocument: (blockId: string, taskId: string, documentId: string) => void
  taskResponsibleOptions: (department?: string, blockId?: string) => ResponsibleOption[]
  maxDeadline?: string
  canCreateTasks?: boolean
  canSaveTasks?: boolean
  canManageTask?: (block: ProjectBlock, task: ProjectTask) => boolean
  canAccessTaskOps?: (block: ProjectBlock, task: ProjectTask) => boolean
  canMoveTask?: (block: ProjectBlock, task: ProjectTask) => boolean
  onCreateSprint: (name: string) => void
}

const documentName = (document?: ProjectDocument) =>
  String(document?.name || document?.label || 'Document').trim()

const statusColumnTheme: Record<string, { header: string; column: string; badge: string }> = {
  pending: {
    header: 'border-sky-200 bg-[#cfe0ff]',
    column: 'bg-[#eef4ff]',
    badge: 'bg-white text-slate-700',
  },
  in_progress: {
    header: 'border-amber-200 bg-[#ffe2b8]',
    column: 'bg-[#fff4e2]',
    badge: 'bg-white text-slate-700',
  },
  review: {
    header: 'border-violet-200 bg-[#eadcff]',
    column: 'bg-[#f7f0ff]',
    badge: 'bg-white text-slate-700',
  },
  done: {
    header: 'border-emerald-200 bg-[#cdeedb]',
    column: 'bg-[#effaf3]',
    badge: 'bg-white text-slate-700',
  },
}

const priorityTintClass = (priority?: string) => {
  switch (priority) {
    case 'low':
      return 'bg-slate-500/70'
    case 'high':
      return 'bg-amber-500/80'
    case 'critical':
      return 'bg-rose-600/85'
    case 'normal':
    default:
      return 'bg-violet-500/75'
  }
}

const taskDayDiffFromToday = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const target = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(target.getTime())) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const taskDeadlineAccentClass = (daysLeft: number | null, status?: string) => {
  if (status === 'done' || daysLeft === null) return 'text-slate-700'
  if (daysLeft < 0) return 'text-rose-700'
  if (daysLeft <= 3) return 'text-rose-700'
  if (daysLeft <= 7) return 'text-amber-800'
  return 'text-slate-700'
}

export default function ProjectTasksTab({
  projectId,
  projectBlocks,
  projectSprints,
  projectRooms,
  allTasks,
  taskDraft,
  showTaskComposer,
  editingTaskKey,
  savingBlocks,
  dirtyBlocks,
  onSave,
  onResetTaskDraft,
  onSetTaskDraftField,
  onAddTaskToBlock,
  onSetEditingTaskKey,
  onRemoveTask,
  onSetTaskField,
  onAttachTaskDocument,
  onRemoveTaskDocument,
  taskResponsibleOptions,
  maxDeadline,
  canCreateTasks = false,
  canSaveTasks = false,
  canManageTask = () => false,
  canAccessTaskOps = () => false,
  canMoveTask = () => false,
  onCreateSprint,
}: Props) {
  const router = useRouter()
  const { setContent, setOpen } = useFilters()
  const [draggingTaskKey, setDraggingTaskKey] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const [blockFilter, setBlockFilter] = useState<string>('all')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [sprintFilter, setSprintFilter] = useState<string>('all')
  const [newSprintName, setNewSprintName] = useState('')
  const [locallyDirtyTaskKeys, setLocallyDirtyTaskKeys] = useState<string[]>([])
  const fileInputsRef = useRef<Record<string, HTMLInputElement | null>>({})
  const hasPendingTaskDraft =
    showTaskComposer &&
    Boolean(String(taskDraft.blockId || '').trim()) &&
    String(taskDraft.blockId || '').trim() !== 'none' &&
    Boolean(String(taskDraft.description || taskDraft.title || '').trim())
  const ownerOptions = Array.from(
    new Set(
      allTasks
        .map(({ task }) => String(task.owner || '').trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right))
  const filteredTasks = allTasks.filter(({ block, task }) => {
    const matchesBlock = blockFilter === 'all' || block.id === blockFilter
    const matchesLevel = levelFilter === 'all' || (task.priority || 'normal') === levelFilter
    const matchesOwner = ownerFilter === 'all' || String(task.owner || '').trim() === ownerFilter
    const matchesSprint =
      sprintFilter === 'all' ||
      (sprintFilter === 'backlog'
        ? !String(task.sprintId || '').trim()
        : String(task.sprintId || '').trim() === sprintFilter)
    return matchesBlock && matchesLevel && matchesOwner && matchesSprint
  })
  const draggingTask = filteredTasks.find(({ taskKey }) => taskKey === draggingTaskKey)
  const roomIdByBlockId = new Map(
    projectRooms
      .filter((room) => room.kind === 'block' && room.blockId)
      .map((room) => [String(room.blockId), room.id])
  )
  const dirtyTasks = dirtyBlocks || locallyDirtyTaskKeys.length > 0 || hasPendingTaskDraft
  const totalFilteredTasks = filteredTasks.length
  const draftDependencyOptions = projectBlocks
    .find((block) => block.id === taskDraft.blockId)
    ?.tasks.filter((task) => task.id !== taskDraft.dependsOn)
    .map((task) => ({
      id: task.id,
      label: `${task.title || 'Tasca'} (${task.status || 'pending'})`,
    })) || []

  useEffect(() => {
    if (!savingBlocks && !dirtyBlocks) {
      setLocallyDirtyTaskKeys([])
    }
  }, [dirtyBlocks, savingBlocks])

  const markTaskDirty = (taskKey: string) => {
    setLocallyDirtyTaskKeys((current) =>
      current.includes(taskKey) ? current : [...current, taskKey]
    )
  }

  const moveTaskToStatus = (blockId: string, taskId: string, status: string) => {
    const currentTask = allTasks.find((item) => item.block.id === blockId && item.task.id === taskId)?.task
    const canLeavePending =
      currentTask?.status !== 'pending' ||
      (String(currentTask?.owner || '').trim() && String(currentTask?.deadline || '').trim())

    const currentEntry = allTasks.find((item) => item.block.id === blockId && item.task.id === taskId)
    if (!currentEntry || !canMoveTask(currentEntry.block, currentEntry.task)) {
      setDragOverStatus(null)
      setDraggingTaskKey(null)
      return
    }

    if (!canLeavePending && status !== 'pending') {
      setDragOverStatus(null)
      setDraggingTaskKey(null)
      return
    }

    onSetTaskField(blockId, taskId, 'status', status)
    markTaskDirty(`${blockId}:${taskId}`)
    setDragOverStatus(null)
    setDraggingTaskKey(null)
  }

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Bloc</label>
          <Select value={blockFilter} onValueChange={setBlockFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els blocs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els blocs</SelectItem>
              {projectBlocks.map((block) => (
                <SelectItem key={`filter-block-${block.id}`} value={block.id}>
                  {block.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Nivell</label>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els nivells" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els nivells</SelectItem>
              {TASK_PRIORITY_OPTIONS.slice(0, 3).map((option) => (
                <SelectItem key={`filter-priority-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Sprint</label>
          <Select value={sprintFilter} onValueChange={setSprintFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els sprints" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els sprints</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              {projectSprints.map((sprint) => (
                <SelectItem key={`filter-sprint-${sprint.id}`} value={sprint.id}>
                  {sprint.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Responsable</label>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tots els responsables" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tots els responsables</SelectItem>
              {ownerOptions.map((owner) => (
                <SelectItem key={`filter-owner-${owner}`} value={owner}>
                  {owner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end pt-2">
          <ResetFilterButton
            onClick={() => {
              setBlockFilter('all')
              setLevelFilter('all')
              setOwnerFilter('all')
              setSprintFilter('all')
            }}
          />
        </div>
      </div>
    )
    setOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] bg-white/75 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className={projectSectionTitleClass}>Tasques</h2>
            <p className={projectSectionSubtitleClass}>Vista operativa de les tasques per estat.</p>
          </div>
          <div className="flex items-center gap-2">
            <FilterButton onClick={openFiltersPanel} />
            <Button
              type="button"
              onClick={() => {
                if (hasPendingTaskDraft && taskDraft.blockId && taskDraft.blockId !== 'none') {
                  onAddTaskToBlock(taskDraft.blockId)
                }
                onSave()
              }}
              disabled={savingBlocks || !canSaveTasks || !dirtyTasks}
              className={`bg-violet-600 text-white hover:bg-violet-700 ${
                savingBlocks
                  ? 'cursor-wait bg-violet-400 hover:bg-violet-400'
                  : canSaveTasks && dirtyTasks
                    ? ''
                    : 'cursor-not-allowed bg-violet-300 hover:bg-violet-300'
              }`}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar canvis
            </Button>
          </div>
        </div>

        {showTaskComposer && canCreateTasks ? (
          <div className="mt-4 pt-2">
            <ProjectTaskQuickComposer
              blockId={taskDraft.blockId}
              blocks={projectBlocks.map((block) => ({
                id: block.id,
                name: block.name,
                departments: block.departments,
                deadline: block.deadline,
              }))}
              description={taskDraft.description || taskDraft.title}
              department={taskDraft.department}
              owner={taskDraft.owner}
              deadline={taskDraft.deadline}
              priority={taskDraft.priority || 'normal'}
              sprintId={taskDraft.sprintId || ''}
              storyPoints={taskDraft.storyPoints || '3'}
              sprintOptions={projectSprints.map((sprint) => ({ id: sprint.id, name: sprint.name }))}
              dependsOn={taskDraft.dependsOn || ''}
              dependencyOptions={draftDependencyOptions}
              departments={projectBlocks.find((block) => block.id === taskDraft.blockId)?.departments || []}
              responsibleOptions={taskResponsibleOptions(
                taskDraft.department ||
                  projectBlocks.find((block) => block.id === taskDraft.blockId)?.departments?.[0] ||
                  '',
                taskDraft.blockId
              ).map((option) => ({
                id: option.id,
                name: option.name,
              }))}
              maxDeadline={
                getPreLaunchDeadline(projectBlocks.find((block) => block.id === taskDraft.blockId)?.deadline) ||
                maxDeadline ||
                undefined
              }
              showBlockSelector
              disabled={savingBlocks || !taskDraft.blockId || taskDraft.blockId === 'none'}
              onBlockChange={(value) => onSetTaskDraftField('blockId', value)}
              onDescriptionChange={(value) => {
                onSetTaskDraftField('description', value)
                onSetTaskDraftField('title', value)
              }}
              onDepartmentChange={(value) => onSetTaskDraftField('department', value)}
              onOwnerChange={(value) => onSetTaskDraftField('owner', value)}
              onDeadlineChange={(value) => onSetTaskDraftField('deadline', value)}
              onPriorityChange={(value) => onSetTaskDraftField('priority', value)}
              onSprintChange={(value) => onSetTaskDraftField('sprintId', value)}
              onStoryPointsChange={(value) => onSetTaskDraftField('storyPoints', value)}
              onDependsOnChange={(value) => onSetTaskDraftField('dependsOn', value)}
              onSubmit={() => {
                if (taskDraft.blockId && taskDraft.blockId !== 'none') onAddTaskToBlock(taskDraft.blockId)
              }}
            />
          </div>
        ) : null}

        {filteredTasks.length === 0 ? (
          <div className={`mt-4 rounded-2xl bg-slate-50/80 px-6 py-10 ${projectEmptyStateClass}`}>
            Encara no hi ha tasques creades.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto pt-2">
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={newSprintName}
                  onChange={(event) => setNewSprintName(event.target.value)}
                  placeholder="Nou sprint (ex: Sprint 12)"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const nextName = newSprintName.trim()
                    if (!nextName) return
                    onCreateSprint(nextName)
                    setNewSprintName('')
                  }}
                >
                  Crear sprint
                </Button>
              </div>
            </div>
            <div className="grid min-w-[1260px] grid-cols-4 gap-5">
              {TASK_STATUS_OPTIONS.map((statusOption) => {
                const columnTasks = filteredTasks.filter(({ task }) => task.status === statusOption.value)
                const theme =
                  statusColumnTheme[statusOption.value] || {
                    header: 'border-slate-200 bg-slate-100',
                    column: 'bg-slate-50/70',
                    badge: 'bg-white text-slate-700',
                  }
                const percent = totalFilteredTasks > 0 ? Math.round((columnTasks.length / totalFilteredTasks) * 100) : 0

                return (
                  <div
                    key={statusOption.value}
                    className={`rounded-[26px] border border-slate-200/70 p-3 transition ${
                      dragOverStatus === statusOption.value ? 'ring-2 ring-violet-200' : ''
                    } ${theme.column}`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (draggingTaskKey) setDragOverStatus(statusOption.value)
                    }}
                    onDragLeave={() => {
                      if (dragOverStatus === statusOption.value) setDragOverStatus(null)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (!draggingTask) return
                      moveTaskToStatus(draggingTask.block.id, draggingTask.task.id, statusOption.value)
                    }}
                  >
                    <div className={`rounded-[18px] border px-4 py-3 shadow-sm ${theme.header}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-slate-950">{statusOption.label}</div>
                          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                            Seguiment de tasques
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${theme.badge}`}>
                          {columnTasks.length}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span>{percent}%</span>
                        <span className="text-slate-500">del total</span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {columnTasks.length === 0 ? (
                        <div className={`rounded-[18px] border border-dashed border-slate-300 bg-white/80 px-4 py-5 ${projectEmptyStateClass}`}>
                          Sense tasques.
                        </div>
                      ) : (
                        columnTasks.map(({ block, task, taskKey }) => {
                          const roomId = roomIdByBlockId.get(block.id) || `room-block-${block.id}`
                          const roomHref = `/menu/projects/${projectId}/rooms/${roomId}`
                          const canManageCurrentTask = canManageTask(block, task)
                          const canAccessOpsCurrentTask = canAccessTaskOps(block, task)
                          const canMoveCurrentTask = canMoveTask(block, task)
                          const isObserverTask = !canAccessOpsCurrentTask
                          const taskDaysLeft = taskDayDiffFromToday(task.deadline)

                          return (
                          <div
                            key={taskKey}
                            draggable={canMoveCurrentTask}
                            onDragStart={() => {
                              if (!canMoveCurrentTask) return
                              setDraggingTaskKey(taskKey)
                            }}
                            onDragEnd={() => {
                              setDraggingTaskKey(null)
                              setDragOverStatus(null)
                            }}
                            className={`relative rounded-[18px] border p-4 shadow-sm transition ${
                              draggingTaskKey === taskKey
                                ? 'cursor-grabbing opacity-60'
                                : canAccessOpsCurrentTask
                                  ? 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-md'
                                  : 'border-slate-200 bg-slate-50/90 cursor-default opacity-70 saturate-[0.85]'
                            }`}
                          >
                            <span
                              className={`absolute left-0 top-5 h-12 w-1 rounded-r-full ${priorityTintClass(task.priority)}`}
                              aria-hidden="true"
                            />
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 pl-2">
                                <div className="flex items-start justify-between gap-3">
                                  <div className={`min-w-0 flex-1 text-[15px] font-semibold leading-5 ${isObserverTask ? 'text-slate-700' : 'text-slate-900'}`}>
                                    {task.title}
                                  </div>
                                  <span
                                    className={`shrink-0 pt-0.5 text-sm font-semibold ${
                                      isObserverTask
                                        ? 'text-slate-500'
                                        : taskDeadlineAccentClass(taskDaysLeft, task.status)
                                    }`}
                                  >
                                    {task.deadline ? formatProjectDate(task.deadline) : 'Sense deadline'}
                                  </span>
                                </div>
                                <div className={`mt-1 text-[15px] ${isObserverTask ? 'text-slate-500' : 'text-slate-800'}`}>
                                  {task.owner || 'Sense responsable'}
                                </div>
                                {task.description ? (
                                  <div className={`mt-1 line-clamp-1 text-[15px] ${isObserverTask ? 'text-slate-500' : 'text-slate-800'}`}>
                                    {task.description}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-start gap-1">
                                <div className="flex items-center gap-1">
                                  {canAccessOpsCurrentTask ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      className="h-8 w-8 rounded-full border-slate-200"
                                      title="Obrir sala"
                                      aria-label="Obrir sala"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        router.push(roomHref)
                                      }}
                                    >
                                      <MessagesSquare className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                  {canAccessOpsCurrentTask ? (
                                    <input
                                      ref={(node) => {
                                        fileInputsRef.current[taskKey] = node
                                      }}
                                      type="file"
                                      className="hidden"
                                      onChange={(event) => {
                                        if (!canAccessOpsCurrentTask) return
                                        const file = event.target.files?.[0]
                                        if (!file) return
                                        onAttachTaskDocument(block.id, task.id, file)
                                        event.currentTarget.value = ''
                                      }}
                                    />
                                  ) : null}
                                  {canManageCurrentTask ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 rounded-full"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        onSetEditingTaskKey((current) => (current === taskKey ? null : taskKey))
                                      }}
                                      aria-label={editingTaskKey === taskKey ? 'Plegar edicio' : 'Desplegar edicio'}
                                    >
                                      <ChevronDown
                                        className={`h-4 w-4 transition-transform ${
                                          editingTaskKey === taskKey ? 'rotate-180' : ''
                                        }`}
                                      />
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className={`mt-3 flex flex-wrap items-center gap-2.5 pl-2 text-xs ${isObserverTask ? 'text-slate-400' : 'text-slate-500'}`}>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${isObserverTask ? 'bg-white text-slate-500 ring-1 ring-slate-200' : 'bg-slate-100 text-slate-700'}`}>
                                {block.name}
                              </span>
                              {task.department ? (
                                <span className={`rounded-full px-2.5 py-1 font-medium ${isObserverTask ? 'bg-white text-slate-500 ring-1 ring-slate-200' : colorByDepartment(task.department)}`}>
                                  {task.department}
                                </span>
                              ) : null}
                              <span className={`rounded-full px-2.5 py-1 font-medium ${isObserverTask ? 'bg-white text-slate-500 ring-1 ring-slate-200' : 'bg-indigo-100 text-indigo-700'}`}>
                                {projectSprints.find((item) => item.id === task.sprintId)?.name || 'Backlog'}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${isObserverTask ? 'bg-white text-slate-500 ring-1 ring-slate-200' : 'bg-violet-100 text-violet-700'}`}>
                                {(task.storyPoints || '3').trim() || '3'} SP
                              </span>
                              {task.dependsOn ? (
                                <span className={`rounded-full px-2.5 py-1 font-medium ${isObserverTask ? 'bg-white text-slate-500 ring-1 ring-slate-200' : 'bg-amber-100 text-amber-800'}`}>
                                  Depen de 1 tasca
                                </span>
                              ) : null}
                              {isObserverTask ? (
                                <span className="rounded-full bg-white px-2.5 py-1 font-medium text-slate-500 ring-1 ring-slate-200">
                                  Observador
                                </span>
                              ) : null}
                              {(task.documents || []).length > 0 ? (
                                <span>{(task.documents || []).length} docs</span>
                              ) : null}
                              {canMoveCurrentTask ? (
                                <span className="text-slate-400">Arrossega per moure</span>
                              ) : null}
                            </div>

                            {editingTaskKey !== taskKey ? (
                              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-slate-400"
                                  style={{ width: `${Math.max(percent, 8)}%` }}
                                />
                              </div>
                            ) : null}

                            {editingTaskKey === taskKey && canManageCurrentTask ? (
                              <div className="mt-4 space-y-3 pt-3">
                                {canAccessOpsCurrentTask ? (
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="gap-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        fileInputsRef.current[taskKey]?.click()
                                      }}
                                    >
                                      <Paperclip className="h-4 w-4" />
                                      Adjuntar document
                                    </Button>
                                  </div>
                                ) : null}
                                <div className="grid gap-3 sm:grid-cols-[130px_170px_minmax(0,1fr)]">
                                  <div className="min-w-0">
                                    <Select
                                      value={task.priority || 'normal'}
                                      onValueChange={(value) => {
                                        onSetTaskField(block.id, task.id, 'priority', value)
                                        markTaskDirty(taskKey)
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Nivell" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {TASK_PRIORITY_OPTIONS.slice(0, 3).map((option) => (
                                          <SelectItem key={`${task.id}-priority-${option.value}`} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      type="date"
                                      value={task.deadline}
                                      aria-label="Data limit"
                                      max={getPreLaunchDeadline(block.deadline) || maxDeadline || undefined}
                                      onChange={(event) => {
                                        onSetTaskField(block.id, task.id, 'deadline', event.target.value)
                                        markTaskDirty(taskKey)
                                      }}
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <Input
                                      value={task.cost || ''}
                                      placeholder="Cost"
                                      onChange={(event) => {
                                        onSetTaskField(block.id, task.id, 'cost', event.target.value)
                                        markTaskDirty(taskKey)
                                      }}
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="min-w-0">
                                    <Select
                                      value={task.sprintId || 'none'}
                                      onValueChange={(value) => {
                                        onSetTaskField(block.id, task.id, 'sprintId', value === 'none' ? '' : value)
                                        markTaskDirty(taskKey)
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Sprint" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Backlog</SelectItem>
                                        {projectSprints.map((sprint) => (
                                          <SelectItem key={`${task.id}-sprint-${sprint.id}`} value={sprint.id}>
                                            {sprint.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="min-w-0">
                                    <Select
                                      value={task.storyPoints || '3'}
                                      onValueChange={(value) => {
                                        onSetTaskField(block.id, task.id, 'storyPoints', value)
                                        markTaskDirty(taskKey)
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Story points" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {SCRUM_STORY_POINT_OPTIONS.map((option) => (
                                          <SelectItem key={`${task.id}-points-${option.value}`} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3">
                                  <div className="min-w-0">
                                    <Select
                                      value={task.dependsOn || 'none'}
                                      onValueChange={(value) => {
                                        const nextValue = value === 'none' ? '' : value
                                        if (nextValue === task.id) return
                                        onSetTaskField(block.id, task.id, 'dependsOn', nextValue)
                                        markTaskDirty(taskKey)
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Depen de" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Sense dependencia</SelectItem>
                                        {block.tasks
                                          .filter((candidate) => candidate.id !== task.id)
                                          .map((candidate) => (
                                            <SelectItem
                                              key={`${task.id}-depends-${candidate.id}`}
                                              value={candidate.id}
                                            >
                                              {(candidate.title || 'Tasca').slice(0, 44)}
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="min-w-0">
                                    <Select
                                      value={task.owner || 'none'}
                                      onValueChange={(value) => {
                                        onSetTaskField(block.id, task.id, 'owner', value === 'none' ? '' : value)
                                        markTaskDirty(taskKey)
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Responsable" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Sense responsable</SelectItem>
                                        {taskResponsibleOptions(
                                          task.department || block.departments?.[0] || block.department || '',
                                          block.id
                                        ).map((option) => (
                                          <SelectItem key={`${option.id}-${option.name}`} value={option.name}>
                                            {option.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                {(task.documents || []).length > 0 ? (
                                  <div className="rounded-2xl bg-slate-50 px-4 py-3">
                                    <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                      Documents
                                    </div>
                                    <div className="space-y-2">
                                      {(task.documents || []).map((document) => (
                                        <div key={document?.id || documentName(document)} className="flex items-center justify-between gap-3 text-sm">
                                          <button
                                            type="button"
                                            className="truncate text-left text-slate-700 hover:text-violet-700"
                                            onClick={() => {
                                              if (document?.url) window.open(document.url, '_blank', 'noopener,noreferrer')
                                            }}
                                          >
                                            {documentName(document)}
                                          </button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                                            onClick={() => {
                                              if (document?.id) onRemoveTaskDocument(block.id, task.id, document.id)
                                            }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


'use client'

import { useRef, useState } from 'react'
import {
  FileText,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import FilterButton from '@/components/ui/filter-button'
import { BLOCK_WORKSPACE_OPEN_LABEL } from './project-room-ui'
import {
  CorporateFilterField,
  CorporateFiltersShell,
} from '@/components/layout/corporate-filters'
import {
  corporateFilterChipClass,
  corporateFilterFieldClass,
} from '@/lib/corporate-filters'
import ResetFilterButton from '@/components/ui/ResetFilterButton'
import { useFilters } from '@/context/FiltersContext'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  getPreLaunchDeadline,
  normalizeTaskWorkflowStatus,
  type ProjectBlock,
  type ProjectSprint,
  type ProjectTask,
} from './project-shared'
import ProjectTaskQuickComposer from './ProjectTaskQuickComposer'
import ProjectTaskCard from './ProjectTaskCard'
import VirtualizedKanbanColumn from './VirtualizedKanbanColumn'
import { projectEmptyStateClass } from './project-ui'
import { type ResponsibleOption } from './project-workspace-helpers'

type TaskDraft = {
  blockId: string
  title: string
  description: string
  department: string
  owner: string
  deadline: string
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
  projectRooms: Array<{ id: string; blockId?: string; kind: 'block' | 'manual' | 'general' }>
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
  canConvokeTaskMeeting?: (block: ProjectBlock, task: ProjectTask) => boolean
  canAccessTaskOps?: (block: ProjectBlock, task: ProjectTask) => boolean
  canMoveTask?: (block: ProjectBlock, task: ProjectTask) => boolean
  canOpenMeetingMinutes?: boolean
  onOpenMeetingMinutes?: () => void
  kickoffMinutesStatus?: 'open' | 'closed'
  kickoffMinutesDraft?: string
  onCreateSprint: (name: string) => void
  onOpenTaskMeeting?: (blockId: string, taskId: string) => void
}

const statusColumnTheme: Record<string, { header: string; column: string; badge: string }> = {
  pending: {
    header: 'border-sky-300 bg-sky-200/90',
    column: 'bg-sky-50/90',
    badge: 'bg-white text-slate-700 shadow-sm',
  },
  in_progress: {
    header: 'border-amber-300 bg-amber-200/90',
    column: 'bg-amber-50/90',
    badge: 'bg-white text-slate-700 shadow-sm',
  },
  review: {
    header: 'border-violet-300 bg-violet-200/90',
    column: 'bg-violet-50/90',
    badge: 'bg-white text-slate-700 shadow-sm',
  },
  done: {
    header: 'border-emerald-300 bg-emerald-200/90',
    column: 'bg-emerald-50/90',
    badge: 'bg-white text-slate-700 shadow-sm',
  },
}

const TASK_BOARD_STATUS_ORDER = ['pending', 'in_progress', 'done', 'blocked'] as const

export default function ProjectTasksTab({
  projectId,
  projectBlocks,
  projectSprints: _projectSprints,
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
  canConvokeTaskMeeting = () => false,
  canAccessTaskOps = () => false,
  canMoveTask = () => false,
  canOpenMeetingMinutes = false,
  onOpenMeetingMinutes,
  kickoffMinutesStatus = 'open',
  kickoffMinutesDraft = '',
  onCreateSprint: _onCreateSprint,
  onOpenTaskMeeting,
}: Props) {
  void onResetTaskDraft
  const { setContent, setOpen } = useFilters()
  const [draggingTaskKey, setDraggingTaskKey] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
  const [blockFilter, setBlockFilter] = useState<string[]>([])
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
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
    const matchesBlock = blockFilter.length === 0 || blockFilter.includes(block.id)
    const matchesLevel = levelFilter === 'all' || (task.priority || 'normal') === levelFilter
    const matchesOwner = ownerFilter === 'all' || String(task.owner || '').trim() === ownerFilter
    return matchesBlock && matchesLevel && matchesOwner
  })
  const draggingTask = filteredTasks.find(({ taskKey }) => taskKey === draggingTaskKey)
  const roomIdByBlockId = new Map(
    projectRooms
      .filter((room) => room.kind === 'block' && room.blockId)
      .map((room) => [String(room.blockId), room.id])
  )
  const dirtyTasks = dirtyBlocks || hasPendingTaskDraft
  const totalFilteredTasks = filteredTasks.length

  const moveTaskToStatus = (blockId: string, taskId: string, status: string) => {
    const currentEntry = allTasks.find((item) => item.block.id === blockId && item.task.id === taskId)
    const currentTask = currentEntry?.task
    if (!currentEntry || !canMoveTask(currentEntry.block, currentEntry.task)) {
      setDragOverStatus(null)
      setDraggingTaskKey(null)
      return
    }

    const isLeavingPending = currentTask?.status === 'pending' && status !== 'pending'
    const hasOwnerAndDeadline = Boolean(
      String(currentTask?.owner || '').trim() && String(currentTask?.deadline || '').trim()
    )
    const canLeavePending = !isLeavingPending || hasOwnerAndDeadline || canMoveTask(currentEntry.block, currentEntry.task)

    if (!canLeavePending) {
      setDragOverStatus(null)
      setDraggingTaskKey(null)
      return
    }

    const currentStatus = normalizeTaskWorkflowStatus(currentTask?.status)
    const nextStatus = normalizeTaskWorkflowStatus(status)

    if (currentStatus === nextStatus) {
      setDragOverStatus(null)
      setDraggingTaskKey(null)
      return
    }


    onSetTaskField(blockId, taskId, 'status', status)
    setDragOverStatus(null)
    setDraggingTaskKey(null)
  }

  const toggleBlockFilter = (blockId: string) => {
    setBlockFilter((current) =>
      current.includes(blockId)
        ? current.filter((id) => id !== blockId)
        : [...current, blockId]
    )
  }

  const openFiltersPanel = () => {
    setContent(
      <div className="p-4 space-y-4">
        <CorporateFilterField label="Nivell">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className={corporateFilterFieldClass}>
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
        </CorporateFilterField>
        <CorporateFilterField label="Responsable">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className={corporateFilterFieldClass}>
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
        </CorporateFilterField>
        <div className="flex justify-end pt-2">
          <ResetFilterButton
            onClick={() => {
              setBlockFilter([])
              setLevelFilter('all')
              setOwnerFilter('all')
            }}
          />
        </div>
      </div>
    )
    setOpen(true)
  }

  const hasActiveFilters =
    blockFilter.length > 0 || levelFilter !== 'all' || ownerFilter !== 'all'

  return (
    <div className="space-y-2">
      <CorporateFiltersShell
        showHeader={false}
        variant="toolbar"
        className="border-slate-200"
        bodyClassName={cn(
          'flex-wrap gap-2 py-2.5',
          'justify-between'
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {projectBlocks.map((block) => (
            <button
              key={`tasks-block-chip-${block.id}`}
              type="button"
              onClick={() => toggleBlockFilter(block.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition',
                blockFilter.includes(block.id)
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50 hover:text-violet-700'
              )}
            >
              {block.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {canOpenMeetingMinutes && onOpenMeetingMinutes ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onOpenMeetingMinutes}
            >
              <FileText className="h-4 w-4 shrink-0" aria-hidden />
              {kickoffMinutesStatus === 'closed'
                ? 'Tancar acta'
                : kickoffMinutesDraft.trim()
                  ? 'Apunts reuniÃ³'
                  : 'Acta reuniÃ³'}
            </Button>
          ) : null}
          <FilterButton onClick={openFiltersPanel} />
          {hasActiveFilters ? (
            <span className="hidden rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 sm:inline">
              Filtres actius
            </span>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              if (hasPendingTaskDraft && taskDraft.blockId && taskDraft.blockId !== 'none') {
                onAddTaskToBlock(taskDraft.blockId)
              }
              onSave()
            }}
            disabled={savingBlocks || !canSaveTasks || !dirtyTasks}
            className={cn(
              corporateFilterChipClass,
              'inline-flex shrink-0 items-center gap-1.5 border-violet-200 bg-violet-600 text-white hover:bg-violet-700',
              savingBlocks
                ? 'cursor-wait bg-violet-400 hover:bg-violet-400'
                : !canSaveTasks || !dirtyTasks
                  ? 'cursor-not-allowed border-violet-100 bg-violet-300 hover:bg-violet-300'
                  : ''
            )}
          >
            <Save className="h-4 w-4" />
            Guardar
          </Button>
        </div>
      </CorporateFiltersShell>

      <div>
        {showTaskComposer && canCreateTasks ? (
          <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
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
              onSubmit={() => {
                if (taskDraft.blockId && taskDraft.blockId !== 'none') onAddTaskToBlock(taskDraft.blockId)
              }}
            />
          </div>
        ) : null}

        {filteredTasks.length === 0 ? (
          <div className={`rounded-2xl bg-slate-50/80 px-6 py-10 ${projectEmptyStateClass}`}>
            Encara no hi ha tasques creades.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[1260px] grid-cols-4 gap-5">
              {TASK_BOARD_STATUS_ORDER.map((statusValue) => {
                const statusOption = TASK_STATUS_OPTIONS.find((item) => item.value === statusValue)
                if (!statusOption) return null
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-950">
                            <span>{statusOption.label}</span>
                            <span className="text-sm font-semibold text-slate-900">{percent}%</span>
                            <span className="text-sm font-medium text-slate-500">del total</span>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${theme.badge}`}>
                          {columnTasks.length}
                        </span>
                      </div>
                    </div>

                    {columnTasks.length === 0 ? (
                      <div className={`mt-4 rounded-[18px] border border-dashed border-slate-300 bg-white/80 px-4 py-5 ${projectEmptyStateClass}`}>
                        Sense tasques.
                      </div>
                    ) : (
                      <VirtualizedKanbanColumn
                        className="mt-4"
                        items={columnTasks}
                        getItemKey={(entry) => entry.taskKey}
                        estimateSize={editingTaskKey ? 440 : 210}
                        renderItem={({ block, task, taskKey }) => {
                          const roomId = roomIdByBlockId.get(block.id) || `room-block-${block.id}`
                          const roomHref = `/menu/projects/${projectId}/rooms/${roomId}`
                          const canManageCurrentTask = canManageTask(block, task)
                          const canConvokeCurrentTaskMeeting = canConvokeTaskMeeting(block, task)
                          const canAccessOpsCurrentTask = canAccessTaskOps(block, task)
                          const canMoveCurrentTask = canMoveTask(block, task)
                          const canExpandCurrentTask = canAccessOpsCurrentTask
                          const isObserverTask = !canAccessOpsCurrentTask
                          return (
                            <ProjectTaskCard
                              key={taskKey}
                              id={`project-task-${taskKey}`}
                              taskKey={taskKey}
                              task={task}
                              block={block}
                              isExpanded={editingTaskKey === taskKey}
                              isDragging={draggingTaskKey === taskKey}
                              draggable
                              canManage={canManageCurrentTask}
                              canExpand={canExpandCurrentTask}
                              canAccessOps={canAccessOpsCurrentTask}
                              canMove={canMoveCurrentTask}
                              canConvokeMeeting={canConvokeCurrentTaskMeeting}
                              isObserver={isObserverTask}
                              projectBlocks={projectBlocks}
                              taskResponsibleOptions={taskResponsibleOptions}
                              maxDeadline={maxDeadline}
                              titleHref={canAccessOpsCurrentTask ? roomHref : undefined}
                              blockHref={canAccessOpsCurrentTask ? roomHref : undefined}
                              blockLinkTitle={BLOCK_WORKSPACE_OPEN_LABEL}
                              onToggleExpand={() => {
                                onSetEditingTaskKey((current) => (current === taskKey ? null : taskKey))
                              }}
                              onDragStart={() => setDraggingTaskKey(taskKey)}
                              onDragEnd={() => {
                                setDraggingTaskKey(null)
                                setDragOverStatus(null)
                              }}
                              onRemove={() => onRemoveTask(block.id, task.id)}
                              onOpenMeeting={
                                onOpenTaskMeeting
                                  ? () => onOpenTaskMeeting(block.id, task.id)
                                  : undefined
                              }
                              onAttachDocument={(file) => onAttachTaskDocument(block.id, task.id, file)}
                              onAttachClick={() => fileInputsRef.current[taskKey]?.click()}
                              onRemoveDocument={(documentId) =>
                                onRemoveTaskDocument(block.id, task.id, documentId)
                              }
                              fileInputRef={(node) => {
                                fileInputsRef.current[taskKey] = node
                              }}
                              onSetField={(field, value) => {
                                onSetTaskField(block.id, task.id, field, value)
                              }}
                            />
                          )
                        }}
                      />
                    )}
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

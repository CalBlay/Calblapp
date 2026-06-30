'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { colorByDepartment } from '@/lib/colors'
import { cn } from '@/lib/utils'
import {
  BLOCK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  formatProjectDate,
  getBlockDepartments,
  getPreLaunchDeadline,
  type ProjectBlock,
  type ProjectData,
} from './project-shared'
import {
  projectCardMetaClass,
  projectCardTitleClass,
  projectBlockCardClass,
  projectEmptyStateClass,
  projectModuleShellClass,
  projectSectionHeaderBarClass,
  projectSectionSubtitleClass,
  projectSectionTitleClass,
  projectStatusAccentClass,
  projectStatusToneClass,
} from './project-ui'
import ProjectTaskQuickComposer from './ProjectTaskQuickComposer'
import ProjectTaskCoreFields from './ProjectTaskCoreFields'
import { type ResponsibleOption } from './project-workspace-helpers'

type BlockDraft = {
  name: string
  summary: string
  department: string
  departments: string[]
  owner: string
  deadline: string
  budget: string
  dependsOn: string
}

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

type Props = {
  projectId: string
  project: ProjectData
  availableDepartments: string[]
  blockDraft: BlockDraft
  taskDraft: TaskDraft
  showBlockComposer: boolean
  editingBlockId: string | null
  quickTaskBlockId: string | null
  savingBlocks: boolean
  dirtyBlocks: boolean
  onSave: () => void
  onResetBlockDraft: () => void
  onSetBlockDraft: (updater: (current: BlockDraft) => BlockDraft) => void
  onCreateBlock: () => void
  onSetBlockField: <K extends keyof ProjectBlock>(blockId: string, field: K, value: ProjectBlock[K]) => void
  onRemoveBlock: (blockId: string) => void
  onSetEditingBlockId: (value: string | null | ((current: string | null) => string | null)) => void
  onOpenQuickTaskComposer: (blockId: string) => void
  onResetTaskDraft: () => void
  onSetTaskDraftField: <K extends keyof TaskDraft>(field: K, value: TaskDraft[K]) => void
  onAddTaskToBlock: (blockId: string) => void
  onSetTaskField: <K extends keyof ProjectBlock['tasks'][number]>(
    blockId: string,
    taskId: string,
    field: K,
    value: ProjectBlock['tasks'][number][K]
  ) => void
  onRemoveTask: (blockId: string, taskId: string) => void
  departmentResponsibleOptions: (department?: string | string[]) => ResponsibleOption[]
  maxDeadline?: string
  canOpenMeetingMinutes?: boolean
  onOpenMeetingMinutes?: () => void
  canCreateBlocks?: boolean
  canEditBlock?: (block: ProjectBlock) => boolean
  canConvokeBlockMeeting?: (block: ProjectBlock) => boolean
  canAccessBlockRoom?: (block: ProjectBlock) => boolean
  unreadByBlockId?: Record<string, number>
  canEditBlockOwner?: boolean
  onOpenBlockMeeting?: (blockId: string) => void
}

const blockStatusTone = (status: string) => projectStatusToneClass(status)

const blockStatusAccentClass = (status?: string) => projectStatusAccentClass(status)

export default function ProjectBlocksTab({
  projectId,
  project,
  availableDepartments,
  blockDraft,
  taskDraft,
  showBlockComposer,
  editingBlockId,
  quickTaskBlockId,
  savingBlocks,
  dirtyBlocks,
  onSave,
  onResetBlockDraft,
  onSetBlockDraft,
  onCreateBlock,
  onSetBlockField,
  onRemoveBlock,
  onSetEditingBlockId,
  onOpenQuickTaskComposer,
  onResetTaskDraft,
  onSetTaskDraftField,
  onAddTaskToBlock,
  onSetTaskField,
  onRemoveTask,
  departmentResponsibleOptions,
  maxDeadline,
  canOpenMeetingMinutes = false,
  onOpenMeetingMinutes,
  canCreateBlocks = false,
  canEditBlock = () => false,
  canConvokeBlockMeeting = () => false,
  canAccessBlockRoom = () => false,
  unreadByBlockId = {},
  canEditBlockOwner = false,
  onOpenBlockMeeting,
}: Props) {
  const router = useRouter()
  const [showDepartmentPickerByBlock, setShowDepartmentPickerByBlock] = useState<Record<string, boolean>>({})
  const [showBlockDraftDepartmentPicker, setShowBlockDraftDepartmentPicker] = useState(false)
  const [showTasksByBlock, setShowTasksByBlock] = useState<Record<string, boolean>>({})
  const [viewingBlockId, setViewingBlockId] = useState<string | null>(null)

  const getDeadlineHint = (value?: string) => {
    const raw = String(value || '').trim()
    if (!raw) return 'Sense data'
    const target = new Date(`${raw}T00:00:00`)
    if (Number.isNaN(target.getTime())) return 'Sense data'
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return `Vençut fa ${Math.abs(diff)} dies`
    if (diff === 0) return 'Venç avui'
    if (diff === 1) return 'Queda 1 dia'
    return `Queden ${diff} dies`
  }

  const getDeadlineTextTone = (value?: string) => {
    const raw = String(value || '').trim()
    if (!raw) return 'text-slate-500'
    const target = new Date(`${raw}T00:00:00`)
    if (Number.isNaN(target.getTime())) return 'text-slate-500'
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
    const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 0) return 'text-rose-700'
    if (diff <= 3) return 'text-amber-800'
    return 'text-emerald-700'
  }

  const getAvailableDepartments = (block: ProjectBlock) => {
    const selected = getBlockDepartments(block)
    return availableDepartments.filter((department) => !selected.includes(department))
  }

  const orderedBlockDraftDepartments = availableDepartments

  const meetingMinutesLabel =
    project.kickoff.minutesStatus === 'closed'
      ? 'Tancar acta'
      : String(project.kickoff.minutes || '').trim()
        ? 'Apunts reunió'
        : 'Acta reunió'

  return (
    <div className="space-y-6">
      <section className={projectModuleShellClass}>
        <div className={cn('flex flex-wrap items-center justify-between gap-4', projectSectionHeaderBarClass)}>
          <div>
            <h2 className={projectSectionTitleClass}>Blocs</h2>
            <p className={projectSectionSubtitleClass}>Àmbits de treball del projecte.</p>
          </div>
          <div className="flex items-center gap-2">
            {canOpenMeetingMinutes && onOpenMeetingMinutes ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={onOpenMeetingMinutes}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                {meetingMinutesLabel}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={onSave}
              disabled={savingBlocks || !dirtyBlocks || !project.blocks.some((block) => canEditBlock(block))}
              className={`bg-violet-600 text-white hover:bg-violet-700 ${
                dirtyBlocks && project.blocks.some((block) => canEditBlock(block))
                  ? ''
                  : 'cursor-not-allowed bg-violet-300 hover:bg-violet-300'
              }`}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar canvis
            </Button>
            {showBlockComposer && canCreateBlocks ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={onResetBlockDraft}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="bg-gradient-to-b from-violet-50/30 to-white p-5 sm:p-6">
        {showBlockComposer && canCreateBlocks ? (
          <div className="mb-5 rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_180px]">
                  <div className="space-y-2">
                    <Label>Nom del bloc</Label>
                    <Input
                      value={blockDraft.name}
                      onChange={(event) =>
                        onSetBlockDraft((current) => ({ ...current, name: event.target.value.slice(0, 28) }))
                      }
                      maxLength={28}
                      placeholder="Ex: Pla d'obra"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data final</Label>
                    <Input
                      type="date"
                      value={blockDraft.deadline}
                      max={maxDeadline || undefined}
                      onChange={(event) =>
                        onSetBlockDraft((current) => ({ ...current, deadline: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descripció breu</Label>
                  <Input
                    value={blockDraft.summary}
                    onChange={(event) =>
                      onSetBlockDraft((current) => ({ ...current, summary: event.target.value }))
                    }
                    placeholder="Resum curt del bloc"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>Responsable</Label>
                    <Select
                      value={blockDraft.owner || 'none'}
                      onValueChange={(value) =>
                        onSetBlockDraft((current) => ({ ...current, owner: value === 'none' ? '' : value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona responsable" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sense responsable</SelectItem>
                        {departmentResponsibleOptions(blockDraft.departments).map((option) => (
                          <SelectItem key={`${option.id}-${option.name}`} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-end">
                    <Button type="button" onClick={onCreateBlock} className="bg-violet-600 text-white hover:bg-violet-700">
                      <Plus className="mr-2 h-4 w-4" />
                      Afegir bloc
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-[20px] border border-slate-200 bg-white/90 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Departaments</div>
                    <div className="text-xs text-slate-500">
                      Primer es mostren els departaments del projecte, però en pots afegir d'altres.
                    </div>
                  </div>
                  <Popover open={showBlockDraftDepartmentPicker} onOpenChange={setShowBlockDraftDepartmentPicker}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="border-violet-200 text-violet-700 hover:bg-violet-50">
                        <Plus className="mr-2 h-4 w-4" />
                        Afegir
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[300px] p-2">
                      <div className="max-h-72 overflow-y-auto">
                        {orderedBlockDraftDepartments.map((department) => {
                          const selected = blockDraft.departments.includes(department)
                          return (
                            <button
                              key={`draft-department-${department}`}
                              type="button"
                              onClick={() =>
                                onSetBlockDraft((current) => {
                                  const departments = current.departments.includes(department)
                                    ? current.departments.filter((item) => item !== department)
                                    : [...current.departments, department]
                                  return {
                                    ...current,
                                    department: departments[0] || '',
                                    departments,
                                    owner:
                                      current.owner &&
                                      !departmentResponsibleOptions(departments).some((option) => option.name === current.owner)
                                        ? ''
                                        : current.owner,
                                  }
                                })
                              }
                              className={`mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                                selected
                                  ? `${colorByDepartment(department)} ring-1 ring-current/10`
                                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span>{department}</span>
                              {project.departments.includes(department) ? (
                                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                                  Projecte
                                </span>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="min-h-[108px] rounded-2xl bg-slate-50/80 p-3">
                  {blockDraft.departments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {blockDraft.departments.map((department) => (
                        <button
                          key={`selected-draft-${department}`}
                          type="button"
                          onClick={() =>
                            onSetBlockDraft((current) => {
                              const departments = current.departments.filter((item) => item !== department)
                              return {
                                ...current,
                                department: departments[0] || '',
                                departments,
                                owner:
                                  current.owner &&
                                  !departmentResponsibleOptions(departments).some((option) => option.name === current.owner)
                                    ? ''
                                    : current.owner,
                              }
                            })
                          }
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${colorByDepartment(department)}`}
                        >
                          {department}
                          <span className="text-slate-500">×</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[84px] items-center rounded-2xl border border-dashed border-slate-300 px-4 text-sm text-slate-500">
                      Encara no has seleccionat cap departament.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {project.blocks.length === 0 ? (
            <div className={`rounded-[24px] border border-dashed border-violet-200 bg-violet-50/40 px-5 py-10 text-center ${projectEmptyStateClass}`}>
              Encara no hi ha blocs. Crea el primer front de treball del projecte.
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {project.blocks.map((block) => {
              const canEditCurrentBlock = canEditBlock(block)
              const canConvokeCurrentBlockMeeting = canConvokeBlockMeeting(block)
              const canAccessCurrentBlockRoom = canAccessBlockRoom(block)
              const isViewingReadonly = viewingBlockId === block.id && !canEditCurrentBlock
              const isExpanded = editingBlockId === block.id || isViewingReadonly
              const tasksExpanded = showTasksByBlock[block.id] ?? true
              const blockRoomId =
                project.rooms.find((room) => room.kind === 'block' && room.blockId === block.id)?.id ||
                `room-block-${block.id}`
              const blockRoomHref = `/menu/projects/${projectId}/rooms/${blockRoomId}`
              const taskPending = block.tasks.filter((task) => task.status === 'pending').length
              const taskInProgress = block.tasks.filter((task) => task.status === 'in_progress').length
              const taskDone = block.tasks.filter((task) => task.status === 'done').length
              const taskTotal = block.tasks.length
              const meetingCount = (block.meetings || []).length
              const taskProgressPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0
              const blockDepartments = getBlockDepartments(block)
              const deadlineHint = getDeadlineHint(block.deadline)
              const deadlineTextTone = getDeadlineTextTone(block.deadline)
              const statusLabel =
                BLOCK_STATUS_OPTIONS.find((option) => option.value === block.status)?.label || 'En curs'
              const dependencyName =
                project.blocks.find((item) => item.id === block.dependsOn)?.name || 'Bloc anterior'
              const taskSublineParts: string[] = []
              if (taskPending > 0) taskSublineParts.push(`${taskPending} pendents`)
              if (taskInProgress > 0) taskSublineParts.push(`${taskInProgress} en curs`)
              if (meetingCount > 0) taskSublineParts.push(`${meetingCount} reunions`)
              return (
              <div
                key={block.id}
                id={`project-block-${block.id}`}
                className={cn(
                  isExpanded
                    ? 'group relative col-span-full self-auto flex flex-col overflow-hidden rounded-[24px] border border-violet-200 bg-white shadow-[0_18px_44px_-22px_rgba(109,40,217,0.28)] ring-1 ring-violet-200'
                    : cn(projectBlockCardClass, 'self-start')
                )}
              >
                <div className={`h-1.5 w-full shrink-0 ${blockStatusAccentClass(block.status)}`} />
                <div className={cn('flex flex-1 flex-col p-5', isExpanded && 'space-y-4')}>
                <div
                  className={`flex items-start justify-between gap-3 ${
                    isExpanded && canEditCurrentBlock ? 'rounded-[18px] bg-violet-50/50 px-2 py-1' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="space-y-4 pl-2">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            {canAccessCurrentBlockRoom ? (
                              <button
                                type="button"
                                className={cn(
                                  projectCardTitleClass,
                                  'text-[1.28rem] leading-8 text-violet-700 hover:underline'
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  router.push(blockRoomHref)
                                }}
                              >
                                {block.name || 'Bloc sense nom'}
                              </button>
                            ) : (
                              <div className={cn(projectCardTitleClass, 'text-[1.28rem] leading-8 text-violet-700')}>
                                {block.name || 'Bloc sense nom'}
                              </div>
                            )}
                            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', blockStatusTone(block.status))}>
                              {statusLabel}
                            </span>
                            {canConvokeCurrentBlockMeeting && onOpenBlockMeeting ? (
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 transition hover:bg-violet-100"
                                aria-label="Convocar reunió"
                                title="Convocar reunió"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onOpenBlockMeeting(block.id)
                                }}
                              >
                                <CalendarDays className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                            <span>{block.owner || 'Sense responsable'}</span>
                            <span className="text-slate-300">·</span>
                            <span className="font-medium text-slate-800">{formatProjectDate(block.deadline)}</span>
                            {block.deadline ? (
                              <span className={cn('font-medium', deadlineTextTone)}>{deadlineHint}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <span className="font-semibold text-slate-800">Departaments implicats:</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {blockDepartments.length > 0 ? (
                              blockDepartments.map((department) => (
                                <span
                                  key={`${block.id}-dept-${department}`}
                                  className={cn(
                                    colorByDepartment(department),
                                    'rounded-full px-3 py-1 text-xs font-semibold'
                                  )}
                                >
                                  {department}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-slate-500">Sense departament</span>
                            )}
                          </div>
                        </div>
                        {block.dependsOn ? (
                          <div className="sm:col-span-2">
                            <span className="font-semibold text-slate-800">Depèn de:</span>{' '}
                            {dependencyName}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-slate-800">Tasques</span>
                          <span className="text-slate-500">
                            {taskTotal > 0 ? `${taskDone}/${taskTotal} fetes` : 'Sense tasques'}
                          </span>
                        </div>
                        <div
                          className="h-2 overflow-hidden rounded-full bg-slate-200"
                          title={
                            taskTotal > 0
                              ? `${taskDone} de ${taskTotal} tasques fetes`
                              : 'Sense tasques en aquest bloc'
                          }
                        >
                          <div
                            className="h-full rounded-full bg-sky-500 transition-[width]"
                            style={{ width: taskTotal > 0 ? `${taskProgressPct}%` : '0%' }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                          <span>{taskPending} pendents</span>
                          <span>{taskInProgress} en curs</span>
                          <span>{meetingCount} reunions</span>
                          <span>{taskSublineParts.length > 0 ? taskSublineParts.join(' · ') : 'Sense activitat'}</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    {canEditCurrentBlock ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-slate-300 hover:text-slate-500"
                        onClick={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                          onRemoveBlock(block.id)
                        }}
                        aria-label="Eliminar bloc"
                        title="Eliminar bloc"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                    {canEditCurrentBlock ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full text-slate-600"
                        onClick={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                          onSetEditingBlockId((current) => (current === block.id ? null : block.id))
                        }}
                        aria-label={editingBlockId === block.id ? 'Plegar edicio' : 'Desplegar edicio'}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            editingBlockId === block.id ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full text-slate-600"
                        onClick={(event) => {
                          event.stopPropagation()
                          event.preventDefault()
                          setViewingBlockId((current) => (current === block.id ? null : block.id))
                        }}
                        aria-label={isViewingReadonly ? 'Plegar bloc' : 'Desplegar bloc'}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isViewingReadonly ? 'rotate-180' : ''
                          }`}
                        />
                      </Button>
                    )}
                  </div>
                </div>

                {editingBlockId === block.id && canEditCurrentBlock ? (
                  <>
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_160px_minmax(0,1.6fr)_180px]">
                        <div className="space-y-2">
                          <Label>Nom</Label>
                          <Input
                            value={block.name}
                            onChange={(event) => onSetBlockField(block.id, 'name', event.target.value.slice(0, 28))}
                            maxLength={28}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Data final</Label>
                          <Input
                            type="date"
                            value={block.deadline}
                            max={maxDeadline || undefined}
                            onChange={(event) => onSetBlockField(block.id, 'deadline', event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Departaments</Label>
                          <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
                          {getBlockDepartments(block).map((department) => (
                            <span
                              key={`${block.id}-${department}`}
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${colorByDepartment(department)}`}
                            >
                              {department}
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-600"
                                onClick={() =>
                                  onSetBlockField(
                                    block.id,
                                    'departments',
                                    getBlockDepartments(block).filter((item) => item !== department)
                                  )
                                }
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          <Popover
                            open={Boolean(showDepartmentPickerByBlock[block.id])}
                            onOpenChange={(open) =>
                              setShowDepartmentPickerByBlock((current) => ({
                                ...current,
                                [block.id]: open,
                              }))
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 rounded-full"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-[220px] p-1">
                              <div className="max-h-64 overflow-y-auto">
                                {getAvailableDepartments(block).length === 0 ? (
                                  <div className={`px-3 py-2 ${projectEmptyStateClass}`}>
                                    Sense departaments disponibles
                                  </div>
                                ) : (
                                  getAvailableDepartments(block).map((department) => (
                                    <button
                                      key={`${block.id}-${department}`}
                                      type="button"
                                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${colorByDepartment(department)} hover:brightness-95`}
                                      onClick={() => {
                                        onSetBlockField(block.id, 'departments', [
                                          ...getBlockDepartments(block),
                                          department,
                                        ])
                                        setShowDepartmentPickerByBlock((current) => ({
                                          ...current,
                                          [block.id]: false,
                                        }))
                                      }}
                                    >
                                      <span>{department}</span>
                                      {project.departments.includes(department) ? (
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-violet-600">
                                          Projecte
                                        </span>
                                      ) : (
                                        <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">
                                          Altres
                                        </span>
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Responsable</Label>
                          <Select
                            value={block.owner || 'none'}
                            disabled={!canEditBlockOwner}
                            onValueChange={(value) =>
                              onSetBlockField(block.id, 'owner', value === 'none' ? '' : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Responsable" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sense responsable</SelectItem>
                              {departmentResponsibleOptions(getBlockDepartments(block)).map((option) => (
                                <SelectItem key={`${option.id}-${option.name}`} value={option.name}>
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!canEditBlockOwner ? (
                            <p className="text-xs text-slate-500">Només el responsable o el propietari del projecte pot canviar aquest camp.</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_160px_180px]">
                        <div className="space-y-2">
                          <Label>Descripcio</Label>
                          <Textarea
                            value={block.summary}
                            onChange={(event) => onSetBlockField(block.id, 'summary', event.target.value)}
                            className="h-10 min-h-10 resize-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Comptador</Label>
                          <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-slate-600">
                            {getDeadlineHint(block.deadline)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Cost del bloc</Label>
                          <Input
                            value={block.budget || ''}
                            onChange={(event) => onSetBlockField(block.id, 'budget', event.target.value)}
                            placeholder="Cost del bloc"
                          />
                        </div>
                      </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-left"
                          onClick={() =>
                            setShowTasksByBlock((current) => ({
                              ...current,
                              [block.id]: !(current[block.id] ?? true),
                            }))
                          }
                        >
                          <Label className="cursor-pointer">Tasques</Label>
                          <ChevronDown
                            className={`h-4 w-4 text-slate-500 transition-transform ${
                              tasksExpanded ? 'rotate-0' : '-rotate-90'
                            }`}
                          />
                        </button>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
                            onClick={() => {
                              setShowTasksByBlock((current) => ({
                                ...current,
                                [block.id]: true,
                              }))
                              onOpenQuickTaskComposer(block.id)
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          {quickTaskBlockId === block.id ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={onResetTaskDraft}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                        {tasksExpanded ? (
                          <>
                            {block.tasks.length === 0 ? null : (
                              <div className="space-y-2">
                                {block.tasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="rounded-2xl bg-white px-4 py-3"
                                  >
                                <div className="grid gap-3 lg:grid-cols-[20ch_170px_170px_150px_130px_auto]">
                                  <div className="min-w-0">
                                    <Input
                                      value={task.title}
                                      onChange={(event) =>
                                        onSetTaskField(block.id, task.id, 'title', event.target.value.slice(0, 20))
                                      }
                                      placeholder="Nom de la tasca"
                                      maxLength={20}
                                      className="h-10 w-[20ch]"
                                    />
                                  </div>
                                  <ProjectTaskCoreFields
                                    block={block}
                                    task={task}
                                    maxDeadline={maxDeadline}
                                    departmentResponsibleOptions={departmentResponsibleOptions}
                                    priorityVariant="pill"
                                    onDepartmentChange={(value) =>
                                      onSetTaskField(block.id, task.id, 'department', value)
                                    }
                                    onOwnerChange={(value) =>
                                      onSetTaskField(block.id, task.id, 'owner', value)
                                    }
                                    onDeadlineChange={(value) =>
                                      onSetTaskField(block.id, task.id, 'deadline', value)
                                    }
                                    onPriorityChange={(value) =>
                                      onSetTaskField(block.id, task.id, 'priority', value)
                                    }
                                  />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-10 w-10 rounded-full justify-self-start text-red-600 hover:bg-red-50 hover:text-red-700"
                                      onClick={() => onRemoveTask(block.id, task.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {quickTaskBlockId === block.id ? (
                              <ProjectTaskQuickComposer
                                compact
                                blockName={block.name || 'Bloc'}
                                description={taskDraft.description}
                                department={taskDraft.department}
                                owner={taskDraft.owner}
                                deadline={taskDraft.deadline}
                                priority={taskDraft.priority || 'normal'}
                                sprintId={taskDraft.sprintId || ''}
                                storyPoints={taskDraft.storyPoints || '3'}
                                sprintOptions={(project.sprints || []).map((sprint) => ({
                                  id: sprint.id,
                                  name: sprint.name,
                                }))}
                                dependsOn={taskDraft.dependsOn || ''}
                                dependencyOptions={block.tasks.map((task) => ({
                                  id: task.id,
                                  label: `${task.title || 'Tasca'} (${task.status || 'pending'})`,
                                }))}
                                departments={getBlockDepartments(block)}
                                responsibleOptions={departmentResponsibleOptions(getBlockDepartments(block)).map((option) => ({
                                  id: option.id,
                                  name: option.name,
                                }))}
                                maxDeadline={getPreLaunchDeadline(block.deadline) || maxDeadline || undefined}
                                onDescriptionChange={(value) => onSetTaskDraftField('description', value)}
                                onDepartmentChange={(value) => onSetTaskDraftField('department', value)}
                                onOwnerChange={(value) => onSetTaskDraftField('owner', value)}
                                onDeadlineChange={(value) => onSetTaskDraftField('deadline', value)}
                                onPriorityChange={(value) => onSetTaskDraftField('priority', value)}
                                onSprintChange={(value) => onSetTaskDraftField('sprintId', value)}
                                onStoryPointsChange={(value) => onSetTaskDraftField('storyPoints', value)}
                                onDependsOnChange={(value) => onSetTaskDraftField('dependsOn', value)}
                                onSubmit={() => onAddTaskToBlock(block.id)}
                              />
                            ) : null}
                          </>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-4 py-3 text-sm text-slate-500">
                            Tasques recollides.
                          </div>
                        )}
                      </div>
                    </div>

                  </>
                ) : null}

                {isViewingReadonly ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_180px]">
                      <div className="space-y-2">
                        <Label>Descripcio</Label>
                        <div className="rounded-md border border-input bg-white px-3 py-2 text-sm text-slate-700">
                          {block.summary || 'Sense descripcio'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Comptador</Label>
                        <div className="flex h-10 items-center rounded-md border border-input bg-white px-3 text-sm text-slate-600">
                          {getDeadlineHint(block.deadline)}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Cost del bloc</Label>
                        <div className="flex h-10 items-center rounded-md border border-input bg-white px-3 text-sm text-slate-600">
                          {block.budget || 'Sense cost'}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label>Tasques</Label>
                      {block.tasks.length === 0 ? (
                        <div className={`rounded-2xl bg-white/80 px-4 py-4 ${projectEmptyStateClass}`}>
                          Encara no hi ha tasques en aquest bloc.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {block.tasks.map((task) => (
                            <div key={task.id} className="rounded-2xl bg-white px-4 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-medium text-slate-900">{task.title || 'Tasca'}</div>
                                <span className="text-sm text-slate-500">·</span>
                                <span className="text-sm text-slate-600">{task.owner || 'Sense responsable'}</span>
                                <span className="text-sm text-slate-500">·</span>
                                <span className="text-sm text-slate-600">{formatProjectDate(task.deadline)}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                {task.department ? (
                                  <span className={`rounded-full px-2.5 py-1 ${colorByDepartment(task.department)}`}>
                                    {task.department}
                                  </span>
                                ) : null}
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                  {TASK_PRIORITY_OPTIONS.find((option) => option.value === task.priority)?.label || 'Normal'}
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                                  {TASK_STATUS_OPTIONS.find((option) => option.value === task.status)?.label || 'Pendent'}
                                </span>
                              </div>
                              {task.description ? (
                                <div className="mt-2 text-sm text-slate-600">{task.description}</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                </div>
              </div>
            )})}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

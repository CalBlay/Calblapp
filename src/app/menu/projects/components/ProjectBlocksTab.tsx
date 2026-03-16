'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Users2,
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
  projectEmptyStateClass,
  projectSectionSubtitleClass,
  projectSectionTitleClass,
} from './project-ui'
import ProjectTaskQuickComposer from './ProjectTaskQuickComposer'
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
  onKickoffMinutesChange: (value: string) => void
  onFinalizeKickoffMinutes: () => void
  onReopenKickoffMinutes: () => void
  onKickoffAttendeeAttendanceChange: (key: string, attended: boolean) => void
  onAddKickoffAttendee: (userId: string) => void
  onRemoveKickoffAttendee: (key: string) => void
  kickoffAttendeeOptions: ResponsibleOption[]
  departmentResponsibleOptions: (department?: string | string[]) => ResponsibleOption[]
  maxDeadline?: string
  canViewKickoffSection?: boolean
  canCreateBlocks?: boolean
  canEditBlock?: (block: ProjectBlock) => boolean
  canAccessBlockRoom?: (block: ProjectBlock) => boolean
  canEditBlockOwner?: boolean
}

const blockStatusTone = (status: string) => {
  if (status === 'done') return 'bg-emerald-100 text-emerald-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  if (status === 'blocked') return 'bg-rose-100 text-rose-700'
  if (status === 'overdue') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-100 text-slate-700'
}

const deadlineTone = (deadline?: string) => {
  if (!deadline) return 'bg-slate-100 text-slate-700'
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const diffMs = new Date(deadline).getTime() - new Date(todayKey).getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'bg-rose-100 text-rose-700'
  if (diffDays <= 2) return 'bg-amber-100 text-amber-800'
  return 'bg-emerald-100 text-emerald-700'
}

const blockStatusAccentClass = (status?: string) => {
  if (status === 'done') return 'bg-emerald-500/85'
  if (status === 'in_progress') return 'bg-sky-500/85'
  if (status === 'blocked') return 'bg-rose-500/85'
  if (status === 'overdue') return 'bg-amber-500/85'
  return 'bg-slate-400/80'
}

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
  onKickoffMinutesChange,
  onFinalizeKickoffMinutes,
  onReopenKickoffMinutes,
  onKickoffAttendeeAttendanceChange,
  onAddKickoffAttendee,
  onRemoveKickoffAttendee,
  kickoffAttendeeOptions,
  departmentResponsibleOptions,
  maxDeadline,
  canViewKickoffSection = false,
  canCreateBlocks = false,
  canEditBlock = () => false,
  canAccessBlockRoom = () => false,
  canEditBlockOwner = false,
}: Props) {
  const router = useRouter()
  const [showKickoffAttendeeEditor, setShowKickoffAttendeeEditor] = useState(false)
  const [kickoffAttendeeDraft, setKickoffAttendeeDraft] = useState('none')
  const [showKickoffAttendees, setShowKickoffAttendees] = useState(false)
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
    if (diff < 0) return `Retard ${Math.abs(diff)} dies`
    if (diff === 0) return 'Venc avui'
    if (diff === 1) return 'Falta 1 dia'
    return `Falten ${diff} dies`
  }

  const getAvailableDepartments = (block: ProjectBlock) => {
    const selected = getBlockDepartments(block)
    const available = availableDepartments.filter((department) => !selected.includes(department))
    const projectDepartments = available.filter((department) => project.departments.includes(department))
    const otherDepartments = available.filter((department) => !project.departments.includes(department))
    return [...projectDepartments, ...otherDepartments]
  }

  const orderedBlockDraftDepartments = [
    ...availableDepartments.filter((department) => project.departments.includes(department)),
    ...availableDepartments.filter((department) => !project.departments.includes(department)),
  ]

  return (
    <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[24px] bg-white/75 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className={projectSectionTitleClass}>Blocs</h2>
            <p className={projectSectionSubtitleClass}>Àmbits de treball del projecte.</p>
          </div>
          <div className="flex items-center gap-2">
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

        {showBlockComposer && canCreateBlocks ? (
          <div className="mt-4 rounded-[24px] border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_180px]">
                  <div className="space-y-2">
                    <Label>Nom del bloc</Label>
                    <Input
                      value={blockDraft.name}
                      onChange={(event) =>
                        onSetBlockDraft((current) => ({ ...current, name: event.target.value }))
                      }
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

        {project.context.trim() || project.strategy.trim() ? (
          <div className="mt-4 grid gap-3 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Definicio
              </div>
              <div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">
                {project.context.trim() || 'Sense definicio del projecte.'}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Objectius
              </div>
              <div className="mt-1 line-clamp-3 text-sm leading-6 text-slate-700">
                {project.strategy.trim() || 'Sense objectius estrategics.'}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-4 pt-2">
          {project.blocks.length === 0 ? (
            <div className={`rounded-[24px] bg-slate-50/80 px-5 py-10 ${projectEmptyStateClass}`}>
              Encara no hi ha blocs. Crea el primer front de treball del projecte.
            </div>
          ) : (
            project.blocks.map((block) => {
              const canEditCurrentBlock = canEditBlock(block)
              const canAccessCurrentBlockRoom = canAccessBlockRoom(block)
              const isViewingReadonly = viewingBlockId === block.id && !canEditCurrentBlock
              const isExpanded = editingBlockId === block.id || isViewingReadonly
              const tasksExpanded = showTasksByBlock[block.id] ?? true
              const blockRoomId =
                project.rooms.find((room) => room.kind === 'block' && room.blockId === block.id)?.id ||
                `room-block-${block.id}`
              const blockRoomHref = `/menu/projects/${projectId}/rooms/${blockRoomId}`
              return (
              <div
                key={block.id}
                onClick={() => {
                  if (!canAccessCurrentBlockRoom || isExpanded) return
                  router.push(blockRoomHref)
                }}
                className={`relative space-y-4 rounded-[24px] border p-5 shadow-sm transition ${
                  isExpanded && canEditCurrentBlock
                    ? 'border-violet-200 bg-violet-50/70 ring-1 ring-violet-200'
                    : 'border-slate-200 bg-slate-50/75'
                } ${
                  canAccessCurrentBlockRoom && !isExpanded ? 'cursor-pointer hover:border-violet-300 hover:shadow-md' : ''
                }`}
              >
                <span
                  className={`absolute left-0 top-6 h-14 w-1 rounded-r-full ${blockStatusAccentClass(block.status)}`}
                  aria-hidden="true"
                />
                <div
                  className={`flex items-start justify-between gap-3 rounded-[18px] ${
                    isExpanded && canEditCurrentBlock ? 'bg-white/80 px-2 py-1' : ''
                  }`}
                >
                  <div className="min-w-0 pl-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`min-w-0 flex-1 ${projectCardTitleClass}`}>
                        {block.name || 'Bloc sense nom'}
                      </div>
                      <span className="shrink-0 pt-0.5 text-sm font-semibold text-slate-700">
                        {formatProjectDate(block.deadline) || 'Sense data'}
                      </span>
                    </div>
                    <div className="mt-1 text-[15px] text-slate-800">
                      {block.owner || 'Sense responsable'}
                    </div>
                    {block.summary ? (
                      <div className="mt-1 line-clamp-1 text-[15px] text-slate-800">
                        {block.summary}
                      </div>
                    ) : null}
                    <div className={`mt-3 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start ${projectCardMetaClass}`}>
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {getBlockDepartments(block).length > 0 ? (
                          getBlockDepartments(block).map((department) => (
                            <span
                              key={`${block.id}-summary-${department}`}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${colorByDepartment(department)}`}
                            >
                              {department}
                            </span>
                          ))
                        ) : (
                          <span>Sense departament</span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-l border-slate-200/70 pl-4 text-right">
                        <span className="text-xs font-medium text-slate-500">Tasques</span>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {block.tasks.filter((task) => task.status === 'pending').length} pendents
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          {block.tasks.filter((task) => task.status === 'in_progress').length} en curs
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                          {block.tasks.filter((task) => task.status === 'done').length} fetes
                        </span>
                      </div>
                    </div>
                    {block.dependsOn ? (
                      <div className="mt-2">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          Depen de:{' '}
                          {project.blocks.find((item) => item.id === block.dependsOn)?.name || 'Bloc anterior'}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-1">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${blockStatusTone(block.status)}`}>
                      {BLOCK_STATUS_OPTIONS.find((option) => option.value === block.status)?.label || 'En curs'}
                    </span>
                    {canEditCurrentBlock ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full"
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={(event) => {
                            event.stopPropagation()
                            event.preventDefault()
                            onRemoveBlock(block.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-full"
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
                            onChange={(event) => onSetBlockField(block.id, 'name', event.target.value)}
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
                            <p className="text-xs text-slate-500">Només el responsable del projecte pot canviar aquest camp.</p>
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
                                  <Select
                                    value={task.department || 'none'}
                                    onValueChange={(value) =>
                                      onSetTaskField(
                                        block.id,
                                        task.id,
                                        'department',
                                        value === 'none' ? '' : value
                                      )
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Departament" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Sense departament</SelectItem>
                                      {getBlockDepartments(block).map((department) => (
                                        <SelectItem key={`${task.id}-${department}`} value={department}>
                                          {department}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={task.owner || 'none'}
                                    onValueChange={(value) =>
                                      onSetTaskField(
                                        block.id,
                                        task.id,
                                        'owner',
                                        value === 'none' ? '' : value
                                      )
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Responsable" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Sense responsable</SelectItem>
                                      {departmentResponsibleOptions(task.department || getBlockDepartments(block)).map((option) => (
                                        <SelectItem key={`${task.id}-owner-${option.id}-${option.name}`} value={option.name}>
                                          {option.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="date"
                                    value={task.deadline}
                                    max={getPreLaunchDeadline(block.deadline) || maxDeadline || undefined}
                                    onChange={(event) =>
                                      onSetTaskField(block.id, task.id, 'deadline', event.target.value)
                                    }
                                  />
                                  <div className="grid gap-3 sm:grid-cols-[110px_auto] lg:grid-cols-[110px_auto]">
                                    <Select
                                      value={task.priority || 'normal'}
                                      onValueChange={(value) =>
                                        onSetTaskField(block.id, task.id, 'priority', value)
                                      }
                                    >
                                      <SelectTrigger className="rounded-full border-violet-200 bg-violet-50 px-3 font-medium text-violet-700 hover:bg-violet-100">
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
            )})
          )}
        </div>
      </section>

      {canViewKickoffSection ? (
      <section className="space-y-4 rounded-[24px] bg-slate-50/80 p-5">
        <div>
          <h2 className={projectSectionTitleClass}>Acta de la reunió d'arrencada</h2>
          <p className={projectSectionSubtitleClass}>
            Decisions, acords i punts clau treballats durant la reunió.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          {project.kickoff.minutesStatus === 'closed' ? (
            <Button
              type="button"
              size="sm"
              title="Reobrir acta"
              aria-label="Reobrir acta"
              onClick={onReopenKickoffMinutes}
              disabled={savingBlocks}
              className="bg-amber-500 text-white shadow hover:bg-amber-600"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reobrir acta
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              title="Finalitzar acta"
              aria-label="Finalitzar acta"
              onClick={onFinalizeKickoffMinutes}
              disabled={savingBlocks}
              className="bg-violet-600 text-white shadow hover:bg-violet-700"
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar acta
            </Button>
          )}
        </div>

        <Textarea
          value={project.kickoff.minutes || ''}
          onChange={(event) => onKickoffMinutesChange(event.target.value)}
          disabled={project.kickoff.minutesStatus === 'closed'}
          className="min-h-[360px] bg-white"
          placeholder="Acta de la reunió d'arrencada"
        />

        <div className="space-y-3 rounded-[22px] bg-white/90 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Assistents convocats</div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              onClick={() => {
                setShowKickoffAttendees((current) => !current)
                setShowKickoffAttendeeEditor(false)
              }}
            >
              <Users2 className="h-4 w-4" />
            </button>
          </div>

          {showKickoffAttendees ? (
            <>
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-violet-700 hover:bg-violet-50"
                  onClick={() => {
                    setShowKickoffAttendeeEditor((current) => !current)
                    setKickoffAttendeeDraft('none')
                  }}
                >
                  Editar
                </Button>
              </div>

              {showKickoffAttendeeEditor ? (
                <div className="flex gap-3">
                  <Select value={kickoffAttendeeDraft} onValueChange={setKickoffAttendeeDraft}>
                    <SelectTrigger>
                      <SelectValue placeholder="Afegir assistent" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecciona usuari</SelectItem>
                      {kickoffAttendeeOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name} · {option.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    className="shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => {
                      if (kickoffAttendeeDraft === 'none') return
                      onAddKickoffAttendee(kickoffAttendeeDraft)
                      setKickoffAttendeeDraft('none')
                      setShowKickoffAttendeeEditor(false)
                    }}
                  >
                    Afegir
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {project.kickoff.attendees.length > 0 ? (
                  project.kickoff.attendees.map((attendee) => (
                    <div
                      key={attendee.key}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${
                        attendee.attended === false
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onKickoffAttendeeAttendanceChange(attendee.key, attendee.attended === false)
                        }
                        className="font-medium"
                      >
                        {attendee.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveKickoffAttendee(attendee.key)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className={`rounded-2xl bg-slate-50/80 px-3 py-3 ${projectEmptyStateClass}`}>
                    Encara no hi ha assistents convocats.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  )
}

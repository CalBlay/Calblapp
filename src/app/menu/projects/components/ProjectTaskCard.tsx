'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  CalendarDays,
  ChevronDown,
  Link2,
  MessagesSquare,
  Paperclip,
  Trash2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { dotByDepartment } from '@/lib/colors'
import { cn } from '@/lib/utils'
import {
  formatProjectDate,
  getPreLaunchDeadline,
  TASK_PRIORITY_OPTIONS,
  type ProjectBlock,
  type ProjectDocument,
  type ProjectTask,
  type ProjectTaskDependencyMeta,
} from './project-shared'
import ProjectTaskDependencyPicker from './ProjectTaskDependencyPicker'
import { priorityBadgeClass, type ResponsibleOption } from './project-workspace-helpers'
import {
  priorityBorderClass,
  taskDayDiffFromToday,
  taskDeadlineAccentClass,
} from './project-task-card-ui'

const documentName = (document?: ProjectDocument) =>
  String(document?.name || document?.label || 'Document').trim()

type ProjectTaskCardProps = {
  task: ProjectTask
  block: ProjectBlock
  taskKey?: string
  id?: string
  isExpanded?: boolean
  isDragging?: boolean
  draggable?: boolean
  showBlockName?: boolean
  canManage?: boolean
  canExpand?: boolean
  canAccessOps?: boolean
  canMove?: boolean
  canConvokeMeeting?: boolean
  isObserver?: boolean
  dependencyMeta?: ProjectTaskDependencyMeta | null
  projectBlocks?: ProjectBlock[]
  taskResponsibleOptions?: (department?: string, blockId?: string) => ResponsibleOption[]
  maxDeadline?: string
  titleHref?: string
  blockHref?: string
  blockLinkTitle?: string
  expandedFooter?: ReactNode
  onToggleExpand?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onRemove?: () => void
  onOpenMeeting?: () => void
  onAttachDocument?: (file: File) => void
  onAttachClick?: () => void
  onRemoveDocument?: (documentId: string) => void
  onSetField?: <K extends keyof ProjectTask>(field: K, value: ProjectTask[K]) => void
  fileInputRef?: (node: HTMLInputElement | null) => void
}

export default function ProjectTaskCard({
  task,
  block,
  taskKey,
  id,
  isExpanded = false,
  isDragging = false,
  draggable = false,
  showBlockName = true,
  canManage = false,
  canExpand = false,
  canAccessOps = false,
  canMove = false,
  canConvokeMeeting = false,
  isObserver = false,
  dependencyMeta = null,
  projectBlocks = [],
  taskResponsibleOptions = () => [],
  maxDeadline,
  titleHref,
  blockHref,
  blockLinkTitle,
  expandedFooter,
  onToggleExpand,
  onDragStart,
  onDragEnd,
  onRemove,
  onOpenMeeting,
  onAttachDocument,
  onAttachClick,
  onRemoveDocument,
  onSetField,
  fileInputRef,
}: ProjectTaskCardProps) {
  const taskDaysLeft = taskDayDiffFromToday(task.deadline)
  const docCount = (task.documents || []).length
  const meetingCount = (task.meetings || []).length
  const taskMetaParts: string[] = []
  if (docCount > 0) taskMetaParts.push(`${docCount} doc${docCount === 1 ? '' : 's'}`)
  if (meetingCount > 0) taskMetaParts.push(`${meetingCount} reunió${meetingCount === 1 ? '' : 's'}`)
  if (isObserver) taskMetaParts.push('Observador')
  const priorityLabel =
    TASK_PRIORITY_OPTIONS.find((option) => option.value === (task.priority || 'normal'))?.label ||
    'Normal'

  const titleClassName = cn(
    'min-w-0 truncate text-left text-[15px] font-semibold leading-snug',
    isObserver ? 'text-slate-700' : 'text-slate-900',
    titleHref && 'hover:text-violet-700 hover:underline'
  )

  const renderTitle = () => {
    const label = task.title || 'Tasca'
    if (titleHref) {
      return (
        <Link href={titleHref} className={titleClassName} title={blockLinkTitle}>
          {label}
        </Link>
      )
    }
    return <div className={titleClassName.replace('text-left ', '')}>{label}</div>
  }

  const renderBlockName = () => {
    if (!showBlockName) return null
    const content = (
      <>
        <MessagesSquare className="h-3 w-3 shrink-0" />
        <span className="truncate">{block.name}</span>
      </>
    )
    if (blockHref) {
      return (
        <Link
          href={blockHref}
          className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-violet-700"
          title={blockLinkTitle}
        >
          {content}
        </Link>
      )
    }
    return (
      <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-medium text-slate-500">
        {content}
      </span>
    )
  }

  return (
    <div
      key={taskKey}
      id={id}
      draggable={draggable && canMove}
      onDragStart={() => {
        if (!canMove) return
        onDragStart?.()
      }}
      onDragEnd={() => {
        onDragEnd?.()
      }}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-slate-200 border-t-[3px] bg-white p-3.5 shadow-sm transition',
        priorityBorderClass(task.priority),
        isDragging
          ? 'cursor-grabbing opacity-60'
          : canAccessOps
            ? 'hover:border-violet-200 hover:shadow-md'
            : 'cursor-default bg-slate-50/90 opacity-70 saturate-[0.85]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
              priorityBadgeClass(task.priority || 'normal')
            )}
          >
            {priorityLabel}
          </span>
          {task.department ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
              <span className={cn('h-1.5 w-1.5 rounded-full', dotByDepartment(task.department))} />
              {task.department}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {canAccessOps && onAttachDocument ? (
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                onAttachDocument(file)
                event.currentTarget.value = ''
              }}
            />
          ) : null}
          {canExpand && onToggleExpand ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-500"
              onClick={(event) => {
                event.stopPropagation()
                onToggleExpand()
              }}
              aria-label={isExpanded ? 'Plegar edicio' : 'Desplegar edicio'}
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
            </Button>
          ) : null}
          {canConvokeMeeting && onOpenMeeting ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-500 hover:text-violet-700"
              aria-label="Convocar reunió"
              title="Convocar reunió"
              onClick={(event) => {
                event.stopPropagation()
                onOpenMeeting()
              }}
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {canAccessOps && onAttachDocument ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-500 hover:text-violet-700"
              aria-label="Adjuntar document"
              title="Adjuntar document"
              onClick={(event) => {
                event.stopPropagation()
                onAttachClick?.()
              }}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          {canManage && onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-slate-400 hover:text-rose-600"
              aria-label="Eliminar tasca"
              title="Eliminar tasca"
              onClick={(event) => {
                event.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {renderTitle()}
        {showBlockName ? (
          <>
            <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
              ·
            </span>
            {renderBlockName()}
          </>
        ) : null}
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <User className="h-3 w-3" />
            Responsable
          </div>
          <div className="mt-0.5 truncate text-sm font-medium text-slate-800">
            {task.owner || 'Sense assignar'}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <CalendarDays className="h-3 w-3" />
            Data límit
          </div>
          <div
            className={cn(
              'mt-0.5 text-sm font-medium',
              isObserver ? 'text-slate-500' : taskDeadlineAccentClass(taskDaysLeft, task.status)
            )}
          >
            {task.deadline ? formatProjectDate(task.deadline) : 'Sense data'}
          </div>
        </div>
      </div>

      {dependencyMeta ? (
        <div
          className={cn(
            'mt-2 flex items-start gap-2 rounded-xl px-2.5 py-2 text-xs',
            dependencyMeta.isResolved
              ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100'
              : 'bg-amber-50 text-amber-900 ring-1 ring-amber-100'
          )}
        >
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold uppercase tracking-wide opacity-70">
              {dependencyMeta.isResolved ? 'Dependència feta' : 'Depèn de'}
            </div>
            <div className="truncate font-medium">
              {dependencyMeta.dependencyTask.title || 'Tasca prèvia'}
            </div>
          </div>
        </div>
      ) : null}

      {taskMetaParts.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {taskMetaParts.map((part) => (
            <span
              key={part}
              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
            >
              {part}
            </span>
          ))}
        </div>
      ) : null}

      {isExpanded && canExpand && onSetField ? (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              Anotacions
            </div>
            {canManage ? (
              <Textarea
                value={task.description || ''}
                placeholder="Notes, context o referències sobre la tasca"
                className="min-h-[88px] resize-y border-violet-100 bg-white text-sm font-semibold leading-relaxed text-slate-900 placeholder:font-normal placeholder:text-slate-400"
                onChange={(event) => {
                  onSetField('description', event.target.value)
                }}
              />
            ) : task.description ? (
              <div className="whitespace-pre-wrap rounded-lg border border-violet-100 bg-white px-3 py-2 text-sm font-semibold leading-relaxed text-slate-900">
                {task.description}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Sense anotacions.</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Planificació
            </div>
            <div className={cn('grid gap-2', canManage ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              <div className="min-w-0">
                <Select
                  value={task.priority || 'normal'}
                  onValueChange={(value) => {
                    onSetField('priority', value)
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
                    onSetField('deadline', event.target.value)
                  }}
                />
              </div>
              {canManage ? (
                <div className="min-w-0">
                  <Input
                    value={task.cost || ''}
                    placeholder="Cost"
                    onChange={(event) => {
                      onSetField('cost', event.target.value)
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {canManage ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Assignació i dependències
              </div>
              <div className="space-y-2">
                <ProjectTaskDependencyPicker
                  blocks={projectBlocks}
                  dependsOn={task.dependsOn || ''}
                  excludeTaskId={task.id}
                  idPrefix={`${task.id}-depends`}
                  onDependsOnChange={(value) => {
                    if (value === task.id) return
                    onSetField('dependsOn', value)
                  }}
                />
                <Select
                  value={task.owner || 'none'}
                  onValueChange={(value) => {
                    onSetField('owner', value === 'none' ? '' : value)
                  }}
                >
                  <SelectTrigger className="bg-white">
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
          ) : null}

          {(task.documents || []).length > 0 && onRemoveDocument ? (
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Documents
              </div>
              <div className="space-y-2">
                {(task.documents || []).map((document) => (
                  <div
                    key={document?.id || documentName(document)}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <button
                      type="button"
                      className="truncate text-left text-slate-700 hover:text-violet-700"
                      onClick={() => {
                        if (document?.url) window.open(document.url, '_blank', 'noopener,noreferrer')
                      }}
                    >
                      {documentName(document)}
                    </button>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          if (document?.id) onRemoveDocument(document.id)
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {expandedFooter}
        </div>
      ) : null}
    </div>
  )
}

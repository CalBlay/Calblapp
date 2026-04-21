'use client'

import { Check } from 'lucide-react'
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
import { SCRUM_STORY_POINT_OPTIONS, TASK_PRIORITY_OPTIONS } from './project-shared'

type Props = {
  blockId?: string
  blockName?: string
  blocks?: Array<{ id: string; name: string; departments?: string[]; deadline?: string }>
  description: string
  department: string
  owner?: string
  deadline: string
  priority: string
  sprintId?: string
  storyPoints?: string
  sprintOptions?: Array<{ id: string; name: string }>
  dependsOn?: string
  dependencyOptions?: Array<{ id: string; label: string }>
  departments: string[]
  responsibleOptions?: Array<{ id: string; name: string }>
  maxDeadline?: string
  compact?: boolean
  disabled?: boolean
  showBlockSelector?: boolean
  onDescriptionChange: (value: string) => void
  onBlockChange?: (value: string) => void
  onDepartmentChange: (value: string) => void
  onOwnerChange?: (value: string) => void
  onDeadlineChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onSprintChange?: (value: string) => void
  onStoryPointsChange?: (value: string) => void
  onDependsOnChange?: (value: string) => void
  onSubmit: () => void
}

export default function ProjectTaskQuickComposer({
  blockId = 'none',
  blockName = '',
  blocks = [],
  description,
  department,
  owner = '',
  deadline,
  priority,
  sprintId = '',
  storyPoints = '3',
  sprintOptions = [],
  dependsOn = '',
  dependencyOptions = [],
  departments,
  responsibleOptions = [],
  maxDeadline,
  compact = false,
  disabled,
  showBlockSelector = false,
  onDescriptionChange,
  onBlockChange,
  onDepartmentChange,
  onOwnerChange,
  onDeadlineChange,
  onPriorityChange,
  onSprintChange,
  onStoryPointsChange,
  onDependsOnChange,
  onSubmit,
}: Props) {
  const selectedDepartment =
    department || (departments.length === 1 ? departments[0] : 'none')

  return (
    <div>
      {compact ? (
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-base font-semibold text-slate-900">Nova tasca</div>
              {blockName ? (
                <div className="text-sm font-medium text-slate-500">{blockName}</div>
              ) : null}
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_320px]">
            <div className="space-y-4">
              {showBlockSelector ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Bloc</div>
                  <Select value={blockId} onValueChange={(value) => onBlockChange?.(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona bloc" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecciona bloc</SelectItem>
                      {blocks.map((block) => (
                        <SelectItem key={`task-draft-block-${block.id}`} value={block.id}>
                          {block.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Descripció</div>
                <Textarea
                  value={description}
                  onChange={(event) => onDescriptionChange(event.target.value)}
                  placeholder="Descriu la tasca"
                  className="min-h-[148px] resize-none bg-white"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-[20px] bg-slate-50/80 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Departament</div>
                  <Select
                    value={selectedDepartment}
                    onValueChange={(value) => onDepartmentChange(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder="Departament" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.length > 1 ? (
                        <SelectItem value="none">Selecciona departament</SelectItem>
                      ) : null}
                      {departments.map((item) => (
                        <SelectItem key={`task-draft-${item}`} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Responsable</div>
                  <Select value={owner || 'none'} onValueChange={(value) => onOwnerChange?.(value === 'none' ? '' : value)}>
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder="Responsable" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sense responsable</SelectItem>
                      {responsibleOptions.map((option) => (
                        <SelectItem key={`task-draft-owner-${option.id}-${option.name}`} value={option.name}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Depen de</div>
                <Select
                  value={dependsOn || 'none'}
                  onValueChange={(value) => onDependsOnChange?.(value === 'none' ? '' : value)}
                >
                  <SelectTrigger className="bg-white text-slate-700">
                    <SelectValue placeholder="Sense dependencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sense dependencia</SelectItem>
                    {dependencyOptions.map((option) => (
                      <SelectItem key={`task-draft-dependency-${option.id}`} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Sprint</div>
                  <Select value={sprintId || 'none'} onValueChange={(value) => onSprintChange?.(value === 'none' ? '' : value)}>
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder="Backlog" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Backlog</SelectItem>
                      {sprintOptions.map((option) => (
                        <SelectItem key={`task-draft-sprint-${option.id}`} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Story points</div>
                  <Select value={storyPoints || '3'} onValueChange={(value) => onStoryPointsChange?.(value)}>
                    <SelectTrigger className="bg-white text-slate-700">
                      <SelectValue placeholder="Story points" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCRUM_STORY_POINT_OPTIONS.map((option) => (
                        <SelectItem key={`task-draft-points-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Data límit</div>
                  <Input
                    type="date"
                    value={deadline}
                    max={maxDeadline || undefined}
                    onChange={(event) => onDeadlineChange(event.target.value)}
                    className="bg-white text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Prioritat</div>
                  <Select value={priority || 'normal'} onValueChange={onPriorityChange}>
                    <SelectTrigger className="bg-white font-medium text-slate-800">
                      <SelectValue placeholder="Nivell" />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITY_OPTIONS.slice(0, 3).map((option) => (
                        <SelectItem key={`task-draft-priority-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={onSubmit}
                  disabled={disabled || !description.trim()}
                  className="bg-violet-600 text-white hover:bg-violet-700 disabled:bg-violet-300"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Afegir tasca
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-3 ${
            showBlockSelector
              ? 'md:grid-cols-[220px_minmax(0,1fr)_150px_160px_140px_140px_140px_120px_150px_auto]'
              : 'md:grid-cols-[minmax(0,1fr)_150px_160px_140px_140px_140px_120px_150px_auto]'
          }`}
        >
          {showBlockSelector ? (
            <Select value={blockId} onValueChange={(value) => onBlockChange?.(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Bloc" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecciona bloc</SelectItem>
                {blocks.map((block) => (
                  <SelectItem key={`task-draft-block-${block.id}`} value={block.id}>
                    {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Descripcio de la tasca"
          />
          <Select
            value={selectedDepartment}
            onValueChange={(value) => onDepartmentChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Departament" />
            </SelectTrigger>
            <SelectContent>
              {departments.length > 1 ? (
                <SelectItem value="none">Selecciona departament</SelectItem>
              ) : null}
              {departments.map((item) => (
                <SelectItem key={`task-draft-${item}`} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner || 'none'} onValueChange={(value) => onOwnerChange?.(value === 'none' ? '' : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sense responsable</SelectItem>
              {responsibleOptions.map((option) => (
                <SelectItem key={`task-draft-owner-${option.id}-${option.name}`} value={option.name}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={deadline}
            max={maxDeadline || undefined}
            onChange={(event) => onDeadlineChange(event.target.value)}
          />
          <Select value={sprintId || 'none'} onValueChange={(value) => onSprintChange?.(value === 'none' ? '' : value)}>
            <SelectTrigger>
              <SelectValue placeholder="Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Backlog</SelectItem>
              {sprintOptions.map((option) => (
                <SelectItem key={`task-draft-sprint-${option.id}`} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={storyPoints || '3'} onValueChange={(value) => onStoryPointsChange?.(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Story points" />
            </SelectTrigger>
            <SelectContent>
              {SCRUM_STORY_POINT_OPTIONS.map((option) => (
                <SelectItem key={`task-draft-points-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={dependsOn || 'none'}
            onValueChange={(value) => onDependsOnChange?.(value === 'none' ? '' : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Depen de" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sense dependencia</SelectItem>
              {dependencyOptions.map((option) => (
                <SelectItem key={`task-draft-dependency-${option.id}`} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priority || 'normal'} onValueChange={onPriorityChange}>
            <SelectTrigger>
              <SelectValue placeholder="Nivell" />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITY_OPTIONS.slice(0, 3).map((option) => (
                <SelectItem key={`task-draft-priority-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-slate-500">
            {description
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .join(' ') || 'Nom automatic'}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 hover:text-violet-800"
            onClick={onSubmit}
            disabled={disabled || !description.trim()}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

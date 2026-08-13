'use client'

import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TASK_PRIORITY_OPTIONS } from './project-shared'

const PROJECT_TASK_ROW_GRID_CLASS =
  'grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center'
const PROJECT_TASK_ROW_WITH_BLOCK_GRID_CLASS =
  'grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center'

type Props = {
  blockId?: string
  blockName?: string
  blocks?: Array<{ id: string; name: string; departments?: string[]; deadline?: string }>
  description: string
  department: string
  owner?: string
  deadline: string
  priority: string
  departments: string[]
  responsibleOptions?: Array<{ id: string; name: string }>
  maxDeadline?: string
  compact?: boolean
  disabled?: boolean
  showBlockSelector?: boolean
  showPriority?: boolean
  onDescriptionChange: (value: string) => void
  onBlockChange?: (value: string) => void
  onDepartmentChange: (value: string) => void
  onOwnerChange?: (value: string) => void
  onDeadlineChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onSubmit: () => void
}

export default function ProjectTaskQuickComposer({
  blockId = 'none',
  blockName: _blockName = '',
  blocks = [],
  description,
  department,
  owner = '',
  deadline,
  priority,
  departments,
  responsibleOptions = [],
  maxDeadline,
  compact = false,
  disabled,
  showBlockSelector = false,
  showPriority = true,
  onDescriptionChange,
  onBlockChange,
  onDepartmentChange,
  onOwnerChange,
  onDeadlineChange,
  onPriorityChange,
  onSubmit,
}: Props) {
  const selectedDepartment =
    department || (departments.length === 1 ? departments[0] : 'none')

  return (
    <div>
      {compact ? (
        <div className={showBlockSelector ? PROJECT_TASK_ROW_WITH_BLOCK_GRID_CLASS : PROJECT_TASK_ROW_GRID_CLASS}>
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
            onChange={(event) => onDescriptionChange(event.target.value.slice(0, 20))}
            placeholder="Nom de la tasca"
            maxLength={20}
            className="h-10 w-[20ch]"
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
            className="h-10"
          />
          {showPriority ? (
            <Select value={priority || 'normal'} onValueChange={onPriorityChange}>
              <SelectTrigger className="h-10 rounded-full border-violet-200 bg-violet-50 px-3 font-medium text-violet-700 hover:bg-violet-100">
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
          ) : null}
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
      ) : (
        <div className={showBlockSelector ? PROJECT_TASK_ROW_WITH_BLOCK_GRID_CLASS : PROJECT_TASK_ROW_GRID_CLASS}>
          {showBlockSelector ? (
            <Select value={blockId} onValueChange={(value) => onBlockChange?.(value)}>
              <SelectTrigger className="h-10 min-w-0">
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
            className="h-10 min-w-0"
          />
          <Select
            value={selectedDepartment}
            onValueChange={(value) => onDepartmentChange(value === 'none' ? '' : value)}
          >
            <SelectTrigger className="h-10 min-w-0">
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
            <SelectTrigger className="h-10 min-w-0">
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
            className="h-10 min-w-0"
          />
          {showPriority ? (
            <Select value={priority || 'normal'} onValueChange={onPriorityChange}>
              <SelectTrigger className="h-10 min-w-0 rounded-full border-violet-200 bg-violet-50 px-3 font-medium text-violet-700 hover:bg-violet-100">
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
          ) : null}
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

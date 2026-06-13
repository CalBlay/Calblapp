'use client'

import { getPreLaunchDeadline, getBlockDepartments, TASK_PRIORITY_OPTIONS, type ProjectBlock } from './project-shared'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ResponsibleOption } from './project-workspace-helpers'

type Task = ProjectBlock['tasks'][number]

type Props = {
  block: ProjectBlock
  task: Task
  maxDeadline?: string
  departmentResponsibleOptions: (department?: string | string[]) => ResponsibleOption[]
  onDepartmentChange: (value: string) => void
  onOwnerChange: (value: string) => void
  onDeadlineChange: (value: string) => void
  onPriorityChange: (value: string) => void
  priorityVariant?: 'default' | 'pill'
}

export default function ProjectTaskCoreFields({
  block,
  task,
  maxDeadline,
  departmentResponsibleOptions,
  onDepartmentChange,
  onOwnerChange,
  onDeadlineChange,
  onPriorityChange,
  priorityVariant = 'default',
}: Props) {
  const departments = getBlockDepartments(block)
  const ownerOptions = departmentResponsibleOptions(task.department || departments)

  return (
    <>
      <Select
        value={task.department || 'none'}
        onValueChange={(value) => onDepartmentChange(value === 'none' ? '' : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Departament" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sense departament</SelectItem>
          {departments.map((department) => (
            <SelectItem key={`${task.id}-${department}`} value={department}>
              {department}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={task.owner || 'none'}
        onValueChange={(value) => onOwnerChange(value === 'none' ? '' : value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Responsable" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sense responsable</SelectItem>
          {ownerOptions.map((option) => (
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
        onChange={(event) => onDeadlineChange(event.target.value)}
      />

      <Select value={task.priority || 'normal'} onValueChange={onPriorityChange}>
        <SelectTrigger
          className={
            priorityVariant === 'pill'
              ? 'rounded-full border-violet-200 bg-violet-50 px-3 font-medium text-violet-700 hover:bg-violet-100'
              : undefined
          }
        >
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
    </>
  )
}

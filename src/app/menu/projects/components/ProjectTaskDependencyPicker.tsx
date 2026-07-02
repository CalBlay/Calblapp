'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  findTaskBlockId,
  getBlockTaskDependencyOptions,
  getProjectBlocksWithDependencyCandidates,
  type ProjectBlock,
} from './project-shared'

export const PROJECT_TASK_ROW_GRID_CLASS =
  'grid gap-3 lg:grid-cols-[minmax(12ch,18ch)_minmax(130px,1fr)_minmax(130px,1fr)_minmax(125px,0.9fr)_minmax(100px,0.7fr)_minmax(300px,1.8fr)_auto]'

export const PROJECT_TASK_ROW_WITH_BLOCK_GRID_CLASS =
  'grid gap-3 lg:grid-cols-[minmax(140px,1fr)_minmax(12ch,18ch)_minmax(130px,1fr)_minmax(130px,1fr)_minmax(125px,0.9fr)_minmax(100px,0.7fr)_minmax(300px,1.8fr)_auto]'

const selectTriggerClass = 'h-10 min-w-0 [&>span]:line-clamp-1 [&>span]:text-left'

type Props = {
  blocks: Array<Pick<ProjectBlock, 'id' | 'name' | 'tasks'>>
  dependsOn: string
  excludeTaskId?: string
  onDependsOnChange: (value: string) => void
  idPrefix?: string
}

export default function ProjectTaskDependencyPicker({
  blocks,
  dependsOn,
  excludeTaskId,
  onDependsOnChange,
  idPrefix = 'task-dependency',
}: Props) {
  const resolvedBlockId = findTaskBlockId(blocks, dependsOn)
  const [selectedBlockId, setSelectedBlockId] = useState(resolvedBlockId || 'none')

  useEffect(() => {
    setSelectedBlockId(resolvedBlockId || 'none')
  }, [resolvedBlockId])

  const pickerOptions = useMemo(
    () => ({
      excludeTaskId,
      includeTaskId: dependsOn || undefined,
    }),
    [dependsOn, excludeTaskId]
  )

  const blockOptions = useMemo(
    () => getProjectBlocksWithDependencyCandidates(blocks, pickerOptions),
    [blocks, pickerOptions]
  )

  const selectedBlock = useMemo(
    () => blocks.find((block) => String(block.id || '').trim() === selectedBlockId) || null,
    [blocks, selectedBlockId]
  )

  const taskOptions = useMemo(
    () => getBlockTaskDependencyOptions(selectedBlock, pickerOptions),
    [pickerOptions, selectedBlock]
  )

  const handleBlockChange = (value: string) => {
    setSelectedBlockId(value)

    if (value === 'none') {
      onDependsOnChange('')
      return
    }

    if (dependsOn && findTaskBlockId(blocks, dependsOn) !== value) {
      onDependsOnChange('')
    }
  }

  const handleTaskChange = (value: string) => {
    onDependsOnChange(value === 'none' ? '' : value)
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <Select value={selectedBlockId} onValueChange={handleBlockChange}>
        <SelectTrigger className={selectTriggerClass}>
          <SelectValue placeholder="Bloc" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sense bloc</SelectItem>
          {blockOptions.map((block) => (
            <SelectItem key={`${idPrefix}-block-${block.id}`} value={block.id}>
              {block.name || 'Bloc'}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={dependsOn || 'none'}
        disabled={selectedBlockId === 'none'}
        onValueChange={handleTaskChange}
      >
        <SelectTrigger className={selectTriggerClass}>
          <SelectValue placeholder="Tasca prèvia" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sense dependència</SelectItem>
          {taskOptions.map((option) => (
            <SelectItem key={`${idPrefix}-task-${option.id}`} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

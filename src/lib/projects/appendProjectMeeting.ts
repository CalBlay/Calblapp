import type {
  ProjectBlock,
  ProjectMeetingRecord,
  ProjectTask,
} from '@/app/menu/projects/components/project-shared'

export type AppendProjectMeetingParams = {
  scope: 'block' | 'task'
  blockId: string
  taskId?: string
  meeting: ProjectMeetingRecord
}

export type AppendProjectMeetingResult =
  | { ok: true; blocks: ProjectBlock[] }
  | { ok: false; reason: 'block_not_found' | 'task_not_found' }

function trimId(value: unknown): string {
  return String(value || '').trim()
}

function withMeeting(
  meetings: ProjectMeetingRecord[] | undefined,
  meeting: ProjectMeetingRecord
): ProjectMeetingRecord[] {
  const current = Array.isArray(meetings) ? meetings : []
  if (current.some((item) => trimId(item?.id) && trimId(item.id) === trimId(meeting.id))) {
    return current
  }
  return [...current, meeting]
}

/**
 * Append a convocatoria onto the latest blocks snapshot.
 * Does not replace sibling blocks/tasks, so concurrent edits survive.
 */
export function appendProjectMeetingToBlocks(
  blocks: ProjectBlock[] | unknown,
  params: AppendProjectMeetingParams
): AppendProjectMeetingResult {
  const blockId = trimId(params.blockId)
  const taskId = trimId(params.taskId)
  const list = Array.isArray(blocks) ? blocks : []
  if (!blockId) return { ok: false, reason: 'block_not_found' }

  const blockIndex = list.findIndex((block) => trimId(block?.id) === blockId)
  if (blockIndex < 0) return { ok: false, reason: 'block_not_found' }

  const block = list[blockIndex]
  const tasks = Array.isArray(block.tasks) ? block.tasks : []

  if (params.scope === 'task') {
    if (!taskId) return { ok: false, reason: 'task_not_found' }
    const taskIndex = tasks.findIndex((task) => trimId(task?.id) === taskId)
    if (taskIndex < 0) return { ok: false, reason: 'task_not_found' }

    const nextTasks: ProjectTask[] = tasks.map((task, index) =>
      index === taskIndex
        ? {
            ...task,
            meetings: withMeeting(task.meetings, params.meeting),
          }
        : task
    )

    const nextBlocks = list.map((item, index) =>
      index === blockIndex ? { ...item, tasks: nextTasks } : item
    )
    return { ok: true, blocks: nextBlocks }
  }

  const nextBlocks = list.map((item, index) =>
    index === blockIndex
      ? {
          ...item,
          meetings: withMeeting(item.meetings, params.meeting),
        }
      : item
  )
  return { ok: true, blocks: nextBlocks }
}

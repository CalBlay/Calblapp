export type OutlookCalendarRefs = {
  outlookEventId: string
  outlookEventWebLink: string
  outlookEventEmail: string
}

export type OutlookRefPatch = {
  blockId: string
  taskId?: string
  refs: OutlookCalendarRefs
}

const trimText = (value: unknown) => String(value || '').trim()

export function pickOutlookCalendarRefs(value: unknown): OutlookCalendarRefs {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    outlookEventId: trimText(record.outlookEventId),
    outlookEventWebLink: trimText(record.outlookEventWebLink),
    outlookEventEmail: trimText(record.outlookEventEmail),
  }
}

function refsEqual(left: OutlookCalendarRefs, right: OutlookCalendarRefs) {
  return (
    left.outlookEventId === right.outlookEventId &&
    left.outlookEventWebLink === right.outlookEventWebLink &&
    left.outlookEventEmail === right.outlookEventEmail
  )
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
  )
}

export function collectOutlookRefPatches(
  previousBlocks: unknown,
  nextBlocks: unknown
): OutlookRefPatch[] {
  const previousById = new Map(
    asRecordArray(previousBlocks)
      .map((block) => [trimText(block.id), block] as const)
      .filter(([id]) => Boolean(id))
  )
  const patches: OutlookRefPatch[] = []

  for (const block of asRecordArray(nextBlocks)) {
    const blockId = trimText(block.id)
    if (!blockId) continue

    const previousBlock = previousById.get(blockId)
    const previousBlockRefs = pickOutlookCalendarRefs(previousBlock)
    const nextBlockRefs = pickOutlookCalendarRefs(block)
    if (!refsEqual(previousBlockRefs, nextBlockRefs)) {
      patches.push({ blockId, refs: nextBlockRefs })
    }

    const previousTasksById = new Map(
      asRecordArray(previousBlock?.tasks)
        .map((task) => [trimText(task.id), task] as const)
        .filter(([taskId]) => Boolean(taskId))
    )

    for (const task of asRecordArray(block.tasks)) {
      const taskId = trimText(task.id)
      if (!taskId) continue
      const previousTaskRefs = pickOutlookCalendarRefs(previousTasksById.get(taskId))
      const nextTaskRefs = pickOutlookCalendarRefs(task)
      if (refsEqual(previousTaskRefs, nextTaskRefs)) continue
      patches.push({ blockId, taskId, refs: nextTaskRefs })
    }
  }

  return patches
}

export function applyOutlookRefPatches(
  latestBlocks: unknown,
  patches: OutlookRefPatch[]
): Record<string, unknown>[] {
  const blocks = asRecordArray(latestBlocks)
  if (patches.length === 0) return blocks

  const blockRefs = new Map<string, OutlookCalendarRefs>()
  const taskRefs = new Map<string, OutlookCalendarRefs>()

  for (const patch of patches) {
    const blockId = trimText(patch.blockId)
    if (!blockId) continue
    const taskId = trimText(patch.taskId)
    if (taskId) taskRefs.set(`${blockId}::${taskId}`, patch.refs)
    else blockRefs.set(blockId, patch.refs)
  }

  return blocks.map((block) => {
    const blockId = trimText(block.id)
    const nextBlockRefs = blockRefs.get(blockId)
    const tasks = Array.isArray(block.tasks) ? block.tasks : null
    const nextTasks = tasks
      ? tasks.map((task) => {
          if (!task || typeof task !== 'object') return task
          const taskRecord = task as Record<string, unknown>
          const refs = taskRefs.get(`${blockId}::${trimText(taskRecord.id)}`)
          return refs ? { ...taskRecord, ...refs } : task
        })
      : tasks

    if (!nextBlockRefs && nextTasks === tasks) return block
    return {
      ...block,
      ...(nextBlockRefs || {}),
      ...(nextTasks ? { tasks: nextTasks } : {}),
    }
  })
}

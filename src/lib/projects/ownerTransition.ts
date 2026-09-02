const trimText = (value: unknown) => String(value || '').trim()

export function resolveProjectOwnerTransition({
  previousOwnerName,
  nextOwnerName,
  treatAsNewAssignment = false,
}: {
  previousOwnerName?: unknown
  nextOwnerName?: unknown
  treatAsNewAssignment?: boolean
}) {
  const previous = trimText(previousOwnerName)
  const next = trimText(nextOwnerName)
  const assignmentBaseline = treatAsNewAssignment ? '' : previous

  return {
    shouldNotifyRemoval: Boolean(previous && previous !== next),
    shouldNotifyAssignment: Boolean(next && next !== assignmentBaseline),
  }
}

export type RemovedProjectAssignmentTarget = {
  kind: 'block' | 'task'
  blockId: string
  blockName: string
  taskId: string
  taskName: string
  previousOwnerName: string
  outlookEventId: string
  outlookEventEmail: string
}

export type ProjectAssignmentRecord = {
  id?: unknown
  name?: unknown
  title?: unknown
  owner?: unknown
  outlookEventId?: unknown
  outlookEventEmail?: unknown
  tasks?: ProjectAssignmentRecord[]
}

function asAssignmentList(value: unknown): ProjectAssignmentRecord[] {
  return Array.isArray(value) ? (value as ProjectAssignmentRecord[]) : []
}

function pushOwnerTarget(
  out: RemovedProjectAssignmentTarget[],
  target: RemovedProjectAssignmentTarget
) {
  if (!target.blockId || !target.previousOwnerName) return
  out.push(target)
}

export function collectRemovedProjectAssignmentTargets({
  previousBlocks,
  nextBlocks,
}: {
  previousBlocks?: unknown
  nextBlocks?: unknown
}): RemovedProjectAssignmentTarget[] {
  const previous = asAssignmentList(previousBlocks)
  const nextById = new Map(
    asAssignmentList(nextBlocks)
      .map((block) => [trimText(block.id), block] as const)
      .filter(([id]) => Boolean(id))
  )
  const out: RemovedProjectAssignmentTarget[] = []

  for (const previousBlock of previous) {
    const blockId = trimText(previousBlock.id)
    if (!blockId) continue

    const blockName = trimText(previousBlock.name) || 'Bloc'
    const nextBlock = nextById.get(blockId)
    const previousTasks = asAssignmentList(previousBlock.tasks)

    if (!nextBlock) {
      pushOwnerTarget(out, {
        kind: 'block',
        blockId,
        blockName,
        taskId: '',
        taskName: '',
        previousOwnerName: trimText(previousBlock.owner),
        outlookEventId: trimText(previousBlock.outlookEventId),
        outlookEventEmail: trimText(previousBlock.outlookEventEmail),
      })

      for (const previousTask of previousTasks) {
        pushOwnerTarget(out, {
          kind: 'task',
          blockId,
          blockName,
          taskId: trimText(previousTask.id),
          taskName: trimText(previousTask.title) || 'Tasca',
          previousOwnerName: trimText(previousTask.owner),
          outlookEventId: trimText(previousTask.outlookEventId),
          outlookEventEmail: trimText(previousTask.outlookEventEmail),
        })
      }
      continue
    }

    const nextTaskIds = new Set(
      asAssignmentList(nextBlock.tasks)
        .map((task) => trimText(task.id))
        .filter(Boolean)
    )

    for (const previousTask of previousTasks) {
      const taskId = trimText(previousTask.id)
      if (!taskId || nextTaskIds.has(taskId)) continue
      pushOwnerTarget(out, {
        kind: 'task',
        blockId,
        blockName,
        taskId,
        taskName: trimText(previousTask.title) || 'Tasca',
        previousOwnerName: trimText(previousTask.owner),
        outlookEventId: trimText(previousTask.outlookEventId),
        outlookEventEmail: trimText(previousTask.outlookEventEmail),
      })
    }
  }

  return out
}

export function collectProjectOutlookCalendarEvents(
  blocks?: unknown
): Array<{ email: string; eventId: string }> {
  const seen = new Set<string>()
  const out: Array<{ email: string; eventId: string }> = []

  const push = (emailRaw: unknown, idRaw: unknown) => {
    const email = trimText(emailRaw)
    const eventId = trimText(idRaw)
    if (!email || !eventId) return
    const key = `${email.toLowerCase()}::${eventId}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ email, eventId })
  }

  for (const block of asAssignmentList(blocks)) {
    push(block.outlookEventEmail, block.outlookEventId)
    for (const task of asAssignmentList(block.tasks)) {
      push(task.outlookEventEmail, task.outlookEventId)
    }
  }

  return out
}

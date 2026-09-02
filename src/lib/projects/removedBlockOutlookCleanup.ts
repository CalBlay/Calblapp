export type ProjectOutlookCalendarRef = {
  email: string
  eventId: string
}

const trimText = (value: unknown) => String(value || '').trim()

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object'
  )
}

function pushCalendarRef(
  out: ProjectOutlookCalendarRef[],
  seen: Set<string>,
  email: unknown,
  eventId: unknown
) {
  const nextEmail = trimText(email)
  const nextEventId = trimText(eventId)
  if (!nextEmail || !nextEventId) return

  const key = `${nextEmail.toLowerCase()}::${nextEventId}`
  if (seen.has(key)) return
  seen.add(key)
  out.push({ email: nextEmail, eventId: nextEventId })
}

function collectItemOutlookRefs(
  item: Record<string, unknown>,
  out: ProjectOutlookCalendarRef[],
  seen: Set<string>
) {
  pushCalendarRef(out, seen, item.outlookEventEmail, item.outlookEventId)
  for (const meeting of asRecords(item.meetings)) {
    pushCalendarRef(out, seen, meeting.organizerEmail, meeting.graphEventId)
  }
}

export function collectRemovedBlockOutlookCalendarRefs(
  currentBlocks: unknown,
  nextBlocks: unknown
): ProjectOutlookCalendarRef[] {
  const out: ProjectOutlookCalendarRef[] = []
  const seen = new Set<string>()
  const nextById = new Map<string, Record<string, unknown>>()

  for (const block of asRecords(nextBlocks)) {
    const id = trimText(block.id)
    if (!id) continue
    nextById.set(id, block)
  }

  for (const block of asRecords(currentBlocks)) {
    const blockId = trimText(block.id)
    const nextBlock = blockId ? nextById.get(blockId) : undefined

    if (!nextBlock) {
      collectItemOutlookRefs(block, out, seen)
      for (const task of asRecords(block.tasks)) {
        collectItemOutlookRefs(task, out, seen)
      }
      continue
    }

    const nextTaskIds = new Set(
      asRecords(nextBlock.tasks)
        .map((task) => trimText(task.id))
        .filter(Boolean)
    )
    for (const task of asRecords(block.tasks)) {
      const taskId = trimText(task.id)
      if (!taskId || nextTaskIds.has(taskId)) continue
      collectItemOutlookRefs(task, out, seen)
    }
  }

  return out
}
